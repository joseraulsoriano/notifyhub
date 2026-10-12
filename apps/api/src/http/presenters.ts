import type { AuditEntry, NotificationDetail, NotificationListItem } from '@notifyhub/application';
import type { NotificationRequest, Provider } from '@notifyhub/domain';
import { maskRecipient } from './mask';

export function summary(n: NotificationRequest) {
  return {
    id: n.id,
    status: n.status,
    priority: n.priority,
    preferredChannel: n.preferredChannel,
    createdAt: n.createdAt.toISOString(),
    links: { self: `/v1/notifications/${n.id}` },
  };
}

export function detail({ notification, attempts, history }: NotificationDetail) {
  return {
    ...summary(notification),
    updatedAt: notification.updatedAt.toISOString(),
    attempts: attempts.map((a) => ({
      attemptNumber: a.attemptNumber,
      provider: a.providerCode,
      channel: a.channel,
      status: a.status,
      isFallback: a.isFallback,
      providerMessageId: a.providerMessageId,
      errorCode: a.errorCode,
      latencyMs: a.latencyMs,
      attemptedAt: a.attemptedAt.toISOString(),
    })),
    history: history.map((h) => ({ from: h.from, to: h.to, at: h.occurredAt.toISOString() })),
  };
}

/** Fila de la lista para la consola: sin datos personales completos y con el resumen de intentos. */
export function listItem({
  notification: n,
  attemptCount,
  usedFallback,
  finalChannel,
  totalLatencyMs,
}: NotificationListItem) {
  const body = n.message.body;
  return {
    ...summary(n),
    updatedAt: n.updatedAt.toISOString(),
    subject: n.message.subject ?? null,
    preview: body.length > 140 ? `${body.slice(0, 139)}…` : body,
    recipient: maskRecipient(n.recipient, n.preferredChannel),
    idempotencyKey: n.idempotencyKey,
    attemptCount,
    usedFallback,
    finalChannel,
    totalLatencyMs,
  };
}

export function providerView(p: Provider) {
  return {
    code: p.code,
    channel: p.channel,
    costPerMessage: p.costPerMessage,
    reliabilityScore: p.reliabilityScore,
    health: p.health,
    enabled: p.enabled,
  };
}

export function auditEntry(e: AuditEntry) {
  return {
    id: e.id,
    notificationId: e.notificationId,
    eventType: e.eventType,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    channel: e.channel,
    providerCode: e.providerCode,
    detail: e.detail,
    occurredAt: e.occurredAt.toISOString(),
  };
}
