import type { AttemptStatus, Channel, NotificationStatus } from './enums';

/** Evento de dominio que se emite en cada cambio de estado (RF5, patrón Observer). */
export interface NotificationStatusChanged {
  type: 'notification.status_changed';
  notificationId: string;
  from: NotificationStatus | null;
  to: NotificationStatus;
  occurredAt: Date;
  detail?: Record<string, unknown>;
}

/** Un intento de entrega con un proveedor (exitoso, fallido o que se reintentará). */
export interface DeliveryAttempted {
  type: 'notification.attempted';
  notificationId: string;
  providerCode: string;
  channel: Channel;
  attemptNumber: number;
  isFallback: boolean;
  status: AttemptStatus;
  errorCode: string | null;
  latencyMs: number | null;
  occurredAt: Date;
}

export type NotificationEvent = NotificationStatusChanged | DeliveryAttempted;
