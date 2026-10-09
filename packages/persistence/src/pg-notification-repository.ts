import type { CreateResult, NotificationDetail, NotificationRepository } from '@notifyhub/application';
import type { DeliveryAttempt, NotificationRequest, NotificationStatus } from '@notifyhub/domain';
import { assertTransition } from '@notifyhub/domain';
import type { ClientBase } from 'pg';

interface NotificationRow {
  id: string;
  client_app_id: string;
  idempotency_key: string | null;
  request_hash: string;
  sender: NotificationRequest['sender'];
  recipient: NotificationRequest['recipient'];
  message: NotificationRequest['message'];
  priority: NotificationRequest['priority'];
  preferred_channel: NotificationRequest['preferredChannel'];
  status: NotificationStatus;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `id, client_app_id, idempotency_key, request_hash, sender, recipient, message,
  priority, preferred_channel, status, created_at, updated_at`;

function toDomain(row: NotificationRow): NotificationRequest {
  return {
    id: row.id,
    clientAppId: row.client_app_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    sender: row.sender,
    recipient: row.recipient,
    message: row.message,
    priority: row.priority,
    preferredChannel: row.preferred_channel,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/** Ejecuta `work` en una transacción; si falla, hace ROLLBACK y relanza el error. */
async function inTransaction<T>(db: ClientBase, work: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Repositorio sobre `pg` para correr en Workers detrás de Hyperdrive (ADR-007). Usa las tablas que crea la
 * migración de Prisma; Prisma ya no corre en tiempo de ejecución.
 */
export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly db: ClientBase) {}

  async findByIdempotencyKey(clientAppId: string, key: string) {
    const { rows } = await this.db.query<NotificationRow>(
      `SELECT ${COLUMNS} FROM notification WHERE client_app_id = $1 AND idempotency_key = $2`,
      [clientAppId, key],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async createReceived(n: NotificationRequest): Promise<CreateResult> {
    try {
      const row = await inTransaction(this.db, async () => {
        const { rows } = await this.db.query<NotificationRow>(
          `INSERT INTO notification (id, client_app_id, idempotency_key, request_hash, sender, recipient, message,
             priority, preferred_channel, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RECEIVED', $10, $10)
           RETURNING ${COLUMNS}`,
          [
            n.id,
            n.clientAppId,
            n.idempotencyKey,
            n.requestHash,
            JSON.stringify(n.sender),
            JSON.stringify(n.recipient),
            JSON.stringify(n.message),
            n.priority,
            n.preferredChannel,
            n.createdAt,
          ],
        );
        await this.db.query(
          `INSERT INTO audit_log (notification_id, event_type, to_status, channel, occurred_at)
           VALUES ($1, 'notification.received', 'RECEIVED', $2, $3)`,
          [n.id, n.preferredChannel, n.createdAt],
        );
        return rows[0]!;
      });
      return { created: true, notification: toDomain(row) };
    } catch (error) {
      if (n.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(n.clientAppId, n.idempotencyKey);
        if (existing) return { created: false, existing };
      }
      throw error;
    }
  }

  async transition(id: string, from: NotificationStatus, to: NotificationStatus) {
    assertTransition(from, to);
    await inTransaction(this.db, async () => {
      // El filtro por estado de origen evita carreras entre la API y los workers.
      const { rowCount } = await this.db.query(
        `UPDATE notification SET status = $3, updated_at = now() WHERE id = $1 AND status = $2`,
        [id, from, to],
      );
      if (rowCount === 0) throw new Error(`La notificación ${id} no está en ${from}`);
      await this.db.query(
        `INSERT INTO audit_log (notification_id, event_type, from_status, to_status)
         VALUES ($1, 'notification.status_changed', $2, $3)`,
        [id, from, to],
      );
    });
  }

  async releaseIdempotencyKey(id: string) {
    await this.db.query(`UPDATE notification SET idempotency_key = NULL, updated_at = now() WHERE id = $1`, [
      id,
    ]);
  }

  async findDetail(id: string, clientAppId: string): Promise<NotificationDetail | null> {
    const { rows } = await this.db.query<NotificationRow>(
      `SELECT ${COLUMNS} FROM notification WHERE id = $1 AND client_app_id = $2`,
      [id, clientAppId],
    );
    if (!rows[0]) return null;

    const [attempts, history] = await Promise.all([
      this.db.query<{
        id: string;
        provider_code: string;
        channel: DeliveryAttempt['channel'];
        attempt_number: number;
        is_fallback: boolean;
        status: DeliveryAttempt['status'];
        provider_message_id: string | null;
        error_code: string | null;
        latency_ms: number | null;
        attempted_at: Date;
      }>(
        `SELECT a.id, p.code AS provider_code, a.channel, a.attempt_number, a.is_fallback, a.status,
                a.provider_message_id, a.error_code, a.latency_ms, a.attempted_at
         FROM delivery_attempt a JOIN provider p ON p.id = a.provider_id
         WHERE a.notification_id = $1 ORDER BY a.attempt_number`,
        [id],
      ),
      this.db.query<{
        from_status: NotificationStatus | null;
        to_status: NotificationStatus;
        occurred_at: Date;
      }>(
        `SELECT from_status, to_status, occurred_at FROM audit_log
         WHERE notification_id = $1 AND event_type LIKE 'notification.%' ORDER BY id`,
        [id],
      ),
    ]);

    return {
      notification: toDomain(rows[0]),
      attempts: attempts.rows.map((a) => ({
        id: a.id,
        notificationId: id,
        providerCode: a.provider_code,
        channel: a.channel,
        attemptNumber: a.attempt_number,
        isFallback: a.is_fallback,
        status: a.status,
        providerMessageId: a.provider_message_id,
        errorCode: a.error_code,
        latencyMs: a.latency_ms,
        attemptedAt: a.attempted_at,
      })),
      history: history.rows.map((h) => ({ from: h.from_status, to: h.to_status, occurredAt: h.occurred_at })),
    };
  }
}
