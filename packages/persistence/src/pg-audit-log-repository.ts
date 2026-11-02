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
  notification_priority: string;
  preferred_channel: AuditEntry['channel'];
  idempotency_key_provided: boolean;
  sender_has_name: boolean;
  sender_has_email: boolean;
  sender_has_phone: boolean;
  recipient_has_email: boolean;
  recipient_has_phone: boolean;
  recipient_has_device_token: boolean;
  recipient_has_webhook_url: boolean;
  message_has_subject: boolean;
  message_body_length: number | null;
  message_data_field_count: number;
  attempt_number: number | null;
  attempt_status: string | null;
  attempt_is_fallback: boolean | null;
  attempt_error_code: string | null;
  attempt_latency_ms: number | null;
  attempt_provider_message_id: string | null;
}

function detailsFor(row: AuditRow): Record<string, unknown> | null {
  if (row.event_type === 'notification.received') {
    return (
      row.detail ?? {
        priority: row.notification_priority,
        preferredChannel: row.preferred_channel,
        idempotencyKeyProvided: row.idempotency_key_provided,
        senderFields: [
          row.sender_has_name && 'name',
          row.sender_has_email && 'email',
          row.sender_has_phone && 'phone',
        ].filter(Boolean),
        recipientFields: [
          row.recipient_has_email && 'email',
          row.recipient_has_phone && 'phone',
          row.recipient_has_device_token && 'deviceToken',
          row.recipient_has_webhook_url && 'webhookUrl',
        ].filter(Boolean),
        message: {
          hasSubject: row.message_has_subject,
          bodyLength: row.message_body_length,
          dataFieldCount: row.message_data_field_count,
        },
      }
    );
  }
  if (row.event_type === 'delivery.attempt' && row.attempt_number !== null) {
    return {
      ...row.detail,
      attemptNumber: row.detail?.attemptNumber ?? row.attempt_number,
      status: row.detail?.status ?? row.attempt_status,
      isFallback: row.detail?.isFallback ?? row.attempt_is_fallback,
      errorCode: row.detail?.errorCode ?? row.attempt_error_code,
      latencyMs: row.detail?.latencyMs ?? row.attempt_latency_ms,
      providerMessageId: row.detail?.providerMessageId ?? row.attempt_provider_message_id,
    };
  }
  return row.detail;
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
              a.provider_code, a.detail, a.occurred_at,
              n.priority::text AS notification_priority, n.preferred_channel,
              n.idempotency_key IS NOT NULL AS idempotency_key_provided,
              n.sender ? 'name' AS sender_has_name, n.sender ? 'email' AS sender_has_email,
              n.sender ? 'phone' AS sender_has_phone,
              n.recipient ? 'email' AS recipient_has_email, n.recipient ? 'phone' AS recipient_has_phone,
              n.recipient ? 'deviceToken' AS recipient_has_device_token,
              n.recipient ? 'webhookUrl' AS recipient_has_webhook_url,
              n.message ? 'subject' AS message_has_subject,
              length(n.message->>'body') AS message_body_length,
              jsonb_object_length(COALESCE(n.message->'data', '{}'::jsonb)) AS message_data_field_count,
              d.attempt_number, d.status::text AS attempt_status, d.is_fallback AS attempt_is_fallback,
              d.error_code AS attempt_error_code, d.latency_ms AS attempt_latency_ms,
              d.provider_message_id AS attempt_provider_message_id
       FROM audit_log a
       JOIN notification n ON n.id = a.notification_id
       LEFT JOIN delivery_attempt d ON d.id = a.attempt_id
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
        detail: detailsFor(r),
        occurredAt: r.occurred_at,
      })),
      next: rows.length > page.limit && last ? { createdAt: last.occurred_at, id: last.id } : null,
    };
  }
}
