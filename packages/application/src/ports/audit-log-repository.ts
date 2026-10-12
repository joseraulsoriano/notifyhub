import type { AttemptStatus, Channel, NotificationStatus } from '@notifyhub/domain';
import type { ListCursor } from './notification-repository';

/** Una fila de la bitácora append-only (RF4). */
export interface AuditEntry {
  id: string;
  notificationId: string;
  eventType: string;
  fromStatus: NotificationStatus | null;
  toStatus: NotificationStatus;
  channel: Channel | null;
  providerCode: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: Date;
}

export interface AuditLogFilter {
  notificationId?: string | undefined;
  eventType?: string | undefined;
  channel?: Channel | undefined;
  provider?: string | undefined;
  /** Estado del intento (`delivery.attempt`). */
  status?: AttemptStatus | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface AuditPage {
  items: AuditEntry[];
  /** `createdAt` es la fecha del evento (`occurredAt`) y `id` el id numérico de la fila. */
  next: ListCursor | null;
}

export interface AuditLogRepository {
  /** Entradas de las notificaciones de un cliente, de la más reciente a la más antigua. */
  list(
    clientAppId: string,
    filter: AuditLogFilter,
    page: { limit: number; cursor?: ListCursor },
  ): Promise<AuditPage>;
}
