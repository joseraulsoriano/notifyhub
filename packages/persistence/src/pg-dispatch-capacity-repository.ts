import { randomUUID } from 'node:crypto';
import {
  ProviderCapacityWaitTimeoutError,
  type AcquireProviderCapacityInput,
  type DispatchCapacityRepository,
  type ProviderCapacityLease,
  type ProviderCapacityStatus,
} from '@notifyhub/application';
import type { ClientBase } from 'pg';

interface CapacityCounts {
  active_count: number;
  waiting_count: number;
  first_waiting_id: string | null;
}

interface CapacityRow {
  provider_code: string;
  status: 'ACTIVE' | 'WAITING';
  lease_count: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * PostgreSQL-backed provider semaphore. An advisory transaction lock makes cleanup, FIFO promotion,
 * and active-count checks atomic across all dispatcher instances and priority queues.
 */
export class PgDispatchCapacityRepository implements DispatchCapacityRepository {
  constructor(
    private readonly db: ClientBase,
    private readonly sleep: (ms: number) => Promise<void> = realSleep,
  ) {}

  async acquireDispatch(notificationId: string, leaseMs: number): Promise<string | null> {
    const leaseId = randomUUID();
    const { rows } = await this.db.query<{ lease_id: string }>(
      `INSERT INTO notification_dispatch_claim (lease_id, notification_id, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))
       ON CONFLICT (notification_id) DO UPDATE SET
         lease_id = EXCLUDED.lease_id,
         expires_at = EXCLUDED.expires_at
       WHERE notification_dispatch_claim.expires_at <= now()
       RETURNING lease_id`,
      [leaseId, notificationId, leaseMs],
    );
    return rows[0]?.lease_id ?? null;
  }

  async renewDispatch(leaseId: string, leaseMs: number): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE notification_dispatch_claim
       SET expires_at = now() + ($2 * interval '1 millisecond')
       WHERE lease_id = $1 AND expires_at > now()`,
      [leaseId, leaseMs],
    );
    return rowCount === 1;
  }

  async releaseDispatch(leaseId: string): Promise<void> {
    await this.db.query('DELETE FROM notification_dispatch_claim WHERE lease_id = $1', [leaseId]);
  }

  async acquire(input: AcquireProviderCapacityInput): Promise<ProviderCapacityLease> {
    if (!Number.isInteger(input.limit) || input.limit < 1) {
      throw new Error(`Invalid provider concurrency limit for ${input.providerCode}`);
    }

    const leaseId = randomUUID();
    const deadline = Date.now() + input.waitTimeoutMs;
    let nextDispatchRenewal = Date.now() + Math.floor(input.dispatchLeaseMs / 3);
    let waitingNotified = false;
    let acquired: ProviderCapacityLease | null = null;
    try {
      while (Date.now() <= deadline) {
        if (Date.now() >= nextDispatchRenewal) {
          const renewed = await this.renewDispatch(input.dispatchLeaseId, input.dispatchLeaseMs);
          if (!renewed) throw new Error(`Lost dispatch lease for notification ${input.notificationId}`);
          nextDispatchRenewal = Date.now() + Math.floor(input.dispatchLeaseMs / 3);
        }
        const state = await this.withProviderLock(input.providerCode, async () => {
          await this.db.query(
            `DELETE FROM provider_dispatch_lease
             WHERE provider_code = $1 AND expires_at <= now()`,
            [input.providerCode],
          );
          await this.db.query(
            `INSERT INTO provider_dispatch_lease
               (lease_id, provider_code, notification_id, queue_name, status, created_at, expires_at)
             VALUES ($1, $2, $3, $4, 'WAITING', now(), now() + ($5 * interval '1 millisecond'))
             ON CONFLICT (lease_id) DO UPDATE SET
               expires_at = now() + ($5 * interval '1 millisecond')
             WHERE provider_dispatch_lease.status = 'WAITING'`,
            [leaseId, input.providerCode, input.notificationId, input.queue, input.waitTimeoutMs],
          );

          const { rows } = await this.db.query<CapacityCounts>(
            `SELECT
               count(*) FILTER (WHERE status = 'ACTIVE')::int AS active_count,
               count(*) FILTER (WHERE status = 'WAITING')::int AS waiting_count,
               (SELECT lease_id::text FROM provider_dispatch_lease
                 WHERE provider_code = $1 AND status = 'WAITING' AND expires_at > now()
                 ORDER BY queue_position LIMIT 1) AS first_waiting_id
             FROM provider_dispatch_lease
             WHERE provider_code = $1 AND expires_at > now()`,
            [input.providerCode],
          );
          const counts = rows[0]!;
          if (counts.active_count < input.limit && counts.first_waiting_id === leaseId) {
            await this.db.query(
              `UPDATE provider_dispatch_lease
               SET status = 'ACTIVE', acquired_at = now(),
                   expires_at = now() + ($2 * interval '1 millisecond')
               WHERE lease_id = $1 AND status = 'WAITING'`,
              [leaseId, input.leaseMs],
            );
            return {
              acquired: true as const,
              activeCount: counts.active_count + 1,
              waitingCount: counts.waiting_count - 1,
            };
          }
          return {
            acquired: false as const,
            activeCount: counts.active_count,
            waitingCount: counts.waiting_count,
          };
        });

        if (state.acquired) {
          acquired = {
            id: leaseId,
            providerCode: input.providerCode,
            activeCount: state.activeCount,
            limit: input.limit,
          };
          return acquired;
        }
        if (!waitingNotified) {
          waitingNotified = true;
          const counts = await this.counts(input.providerCode);
          input.onWaiting?.({
            activeCount: counts.activeCount,
            waitingCount: counts.waitingCount,
            limit: input.limit,
          });
        }
        await this.sleep(Math.min(250, Math.max(1, deadline - Date.now())));
      }
      throw new ProviderCapacityWaitTimeoutError(input.providerCode);
    } finally {
      if (!acquired) await this.removeLease(leaseId, input.providerCode);
    }
  }

  async release(leaseId: string): Promise<void> {
    const { rows } = await this.db.query<{ provider_code: string }>(
      `SELECT provider_code FROM provider_dispatch_lease WHERE lease_id = $1`,
      [leaseId],
    );
    if (!rows[0]) return;
    await this.removeLease(leaseId, rows[0].provider_code);
  }

  async list(providerLimits: Record<string, number>) {
    const providers = Object.keys(providerLimits).sort();
    if (providers.length === 0) return { observedAt: new Date(), providers: [] };
    const { rows } = await this.db.query<CapacityRow>(
      `SELECT provider_code, status, count(*)::int AS lease_count
       FROM provider_dispatch_lease
       WHERE provider_code = ANY($1::text[]) AND expires_at > now()
       GROUP BY provider_code, status`,
      [providers],
    );
    const byProvider = new Map<string, ProviderCapacityStatus>();
    for (const provider of providers) {
      const limit = providerLimits[provider]!;
      byProvider.set(provider, {
        provider,
        limit,
        activeCount: 0,
        waitingCount: 0,
      });
    }
    for (const row of rows) {
      const status = byProvider.get(row.provider_code);
      if (!status) continue;
      if (row.status === 'ACTIVE') {
        status.activeCount = row.lease_count;
      } else {
        status.waitingCount = row.lease_count;
      }
    }
    return { observedAt: new Date(), providers: [...byProvider.values()] };
  }

  private async counts(providerCode: string): Promise<{ activeCount: number; waitingCount: number }> {
    const { rows } = await this.db.query<CapacityCounts>(
      `SELECT
         count(*) FILTER (WHERE status = 'ACTIVE')::int AS active_count,
         count(*) FILTER (WHERE status = 'WAITING')::int AS waiting_count,
         NULL::text AS first_waiting_id
       FROM provider_dispatch_lease WHERE provider_code = $1 AND expires_at > now()`,
      [providerCode],
    );
    return { activeCount: rows[0]!.active_count, waitingCount: rows[0]!.waiting_count };
  }

  private async removeLease(leaseId: string, providerCode: string): Promise<void> {
    await this.withProviderLock(providerCode, async () => {
      await this.db.query(`DELETE FROM provider_dispatch_lease WHERE lease_id = $1`, [leaseId]);
      return null;
    });
  }

  private async withProviderLock<T>(providerCode: string, work: () => Promise<T>): Promise<T> {
    await this.db.query('BEGIN');
    try {
      await this.db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [providerCode]);
      const result = await work();
      await this.db.query('COMMIT');
      return result;
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }
}
