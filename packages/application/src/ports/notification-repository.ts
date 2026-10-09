import type { DeliveryAttempt, NotificationRequest, NotificationStatus } from '@notifyhub/domain';

export interface StatusHistoryEntry {
  from: NotificationStatus | null;
  to: NotificationStatus;
  occurredAt: Date;
}

export interface NotificationDetail {
  notification: NotificationRequest;
  attempts: DeliveryAttempt[];
  history: StatusHistoryEntry[];
}

export type CreateResult =
  | { created: true; notification: NotificationRequest }
  /** Otra solicitud con la misma Idempotency-Key ganó la carrera. */
  | { created: false; existing: NotificationRequest };

export interface NotificationRepository {
  findByIdempotencyKey(clientAppId: string, key: string): Promise<NotificationRequest | null>;
  /** Guarda la solicitud en RECEIVED y su primera entrada de bitácora en la misma transacción. */
  createReceived(notification: NotificationRequest): Promise<CreateResult>;
  /** Cambia el estado y registra la transición en la bitácora. */
  transition(id: string, from: NotificationStatus, to: NotificationStatus): Promise<void>;
  /** Libera una llave vencida (más de 24 h) para que el cliente pueda reutilizarla. */
  releaseIdempotencyKey(id: string): Promise<void>;
  findDetail(id: string, clientAppId: string): Promise<NotificationDetail | null>;
}
