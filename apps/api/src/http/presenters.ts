import type { NotificationDetail } from '@notifyhub/application';
import type { NotificationRequest } from '@notifyhub/domain';

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
