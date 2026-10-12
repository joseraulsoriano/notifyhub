import type {
  AuditEntry,
  AuditLogFilter,
  AuditLogRepository,
  AuditPage,
  ListCursor,
} from '@notifyhub/application';
import type { ClientBase } from 'pg';

interface AuditRow {
  id: string;
  notification_id: string;
  event_type: string;
  from_status: AuditEntry['fromStatus'];
  to_status: AuditEntry['toStatus'];
  channel: AuditEntry['channel'];
  provider_code: string | null;
  detail: Record<string, unknown> | null;
  occurred_at: Date;
}

/** Bitácora sobre `audit_log`, limitada a las notificaciones del cliente (RF4). */
export class PgAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: ClientBase) {}

  async list(
    clientAppId: string,
    filter: AuditLogFilter,
    page: { limit: number; cursor?: ListCursor },
  ): Promise<AuditPage> {
    const params: unknown[] = [clientAppId];
    const where = ['n.client_app_id = $1'];
    const add = (sql: (placeholder: string) => string, value: unknown) => {
      params.push(value);
      where.push(sql(`$${params.length}`));
    };
    if (filter.notificationId) add((p) => `a.notification_id = ${p}::uuid`, filter.notificationId);
    if (filter.eventType) add((p) => `a.event_type = ${p}`, filter.eventType);
    if (filter.channel) add((p) => `a.channel::text = ${p}`, filter.channel);
    if (filter.provider) add((p) => `a.provider_code = ${p}`, filter.provider);
    if (filter.status) add((p) => `a.detail->>'status' = ${p}`, filter.status);
    if (filter.from) add((p) => `a.occurred_at >= ${p}`, filter.from);
    if (filter.to) add((p) => `a.occurred_at <= ${p}`, filter.to);
    if (page.cursor) {
      params.push(page.cursor.createdAt, page.cursor.id);
      where.push(`(a.occurred_at, a.id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
    }
    params.push(page.limit + 1);

    const { rows } = await this.db.query<AuditRow>(
      `SELECT a.id::text AS id, a.notification_id, a.event_type, a.from_status, a.to_status, a.channel,
              a.provider_code, a.detail, a.occurred_at
       FROM audit_log a JOIN notification n ON n.id = a.notification_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.occurred_at DESC, a.id DESC
       LIMIT $${params.length}`,
      params,
    );

    const visible = rows.slice(0, page.limit);
    const last = visible.at(-1);
    return {
      items: visible.map((r) => ({
        id: r.id,
        notificationId: r.notification_id,
        eventType: r.event_type,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        channel: r.channel,
        providerCode: r.provider_code,
        detail: r.detail,
        occurredAt: r.occurred_at,
      })),
      next: rows.length > page.limit && last ? { createdAt: last.occurred_at, id: last.id } : null,
    };
  }
}
