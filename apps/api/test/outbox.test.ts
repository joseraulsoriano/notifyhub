import type { ClientBase } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PgNotificationRepository } from '@notifyhub/persistence';

function fakeDatabase(query: (sql: string, values?: unknown[]) => { rows?: unknown[]; rowCount?: number }): {
  db: ClientBase;
  calls: { sql: string; values?: unknown[] }[];
} {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [], rowCount: 1, ...query(sql, values) };
    }),
  } as unknown as ClientBase;
  return { db, calls };
}

describe('transactional notification outbox', () => {
  it('stores status changes in the same transaction as the notification transition', async () => {
    const occurredAt = new Date('2026-11-02T12:00:00.000Z');
    const { db, calls } = fakeDatabase((sql) =>
      sql.startsWith('UPDATE notification') ? { rows: [{ updated_at: occurredAt }] } : {},
    );

    await new PgNotificationRepository(db).transition('notification-1', 'SENDING', 'SENT', {
      provider: 'fcm',
    });

    const outbox = calls.find(({ sql }) => sql.includes('INSERT INTO outbox_event'));
    expect(outbox).toBeDefined();
    expect(JSON.parse(String(outbox?.values?.[3]))).toMatchObject({
      type: 'notification.status_changed',
      notificationId: 'notification-1',
      from: 'SENDING',
      to: 'SENT',
      detail: { provider: 'fcm' },
      occurredAt: occurredAt.toISOString(),
    });
    expect(calls[0]?.sql).toBe('BEGIN');
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('rolls back a transition if recording its outbox event fails', async () => {
    const { db, calls } = fakeDatabase((sql) => {
      if (sql.startsWith('UPDATE notification')) return { rows: [{ updated_at: new Date() }] };
      if (sql.includes('INSERT INTO outbox_event')) throw new Error('outbox unavailable');
      return {};
    });

    await expect(
      new PgNotificationRepository(db).transition('notification-1', 'SENDING', 'SENT'),
    ).rejects.toThrow('outbox unavailable');
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('stores attempt events in the same transaction as the attempt record', async () => {
    const attemptedAt = new Date('2026-11-02T12:01:00.000Z');
    const { db, calls } = fakeDatabase((sql) =>
      sql.includes('INSERT INTO delivery_attempt')
        ? { rows: [{ id: 'attempt-1', attempted_at: attemptedAt }] }
        : {},
    );

    await new PgNotificationRepository(db).recordAttempt({
      notificationId: 'notification-1',
      providerCode: 'fcm',
      channel: 'PUSH',
      attemptNumber: 1,
      isFallback: false,
      status: 'SENT',
      providerMessageId: 'provider-message-1',
      errorCode: null,
      latencyMs: 42,
    });

    const outbox = calls.find(({ sql }) => sql.includes('INSERT INTO outbox_event'));
    expect(JSON.parse(String(outbox?.values?.[3]))).toMatchObject({
      type: 'notification.attempted',
      notificationId: 'notification-1',
      providerCode: 'fcm',
      channel: 'PUSH',
      attemptNumber: 1,
      isFallback: false,
      status: 'SENT',
      occurredAt: attemptedAt.toISOString(),
    });
    expect(calls[0]?.sql).toBe('BEGIN');
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });
});
