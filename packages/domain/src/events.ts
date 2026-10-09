import type { NotificationStatus } from './enums';

/** Evento de dominio que se emite en cada cambio de estado (RF5, patrón Observer). */
export interface NotificationStatusChanged {
  type: 'notification.status_changed';
  notificationId: string;
  from: NotificationStatus | null;
  to: NotificationStatus;
  occurredAt: Date;
  detail?: Record<string, unknown>;
}
