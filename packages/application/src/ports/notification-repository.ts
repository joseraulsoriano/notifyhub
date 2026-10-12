import type {
  AttemptStatus,
  Channel,
  DeliveryAttempt,
  NotificationRequest,
  NotificationStatus,
  Priority,
} from '@notifyhub/domain';

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

export interface NotificationListFilter {
  status?: NotificationStatus | undefined;
  channel?: Channel | undefined;
  priority?: Priority | undefined;
  /** Busca en asunto, cuerpo, id e Idempotency-Key (sin distinguir mayúsculas). */
  q?: string | undefined;
}

/** Posición en la lista: se ordena por fecha descendente y, a igualdad, por id (paginación por llave). */
export interface ListCursor {
  createdAt: Date;
  id: string;
}

/** Fila de la lista: la notificación y un resumen de sus intentos, sin traer el historial completo. */
export interface NotificationListItem {
  notification: NotificationRequest;
  attemptCount: number;
  usedFallback: boolean;
  finalChannel: Channel | null;
  totalLatencyMs: number;
}

export interface NotificationPage {
  items: NotificationListItem[];
  next: ListCursor | null;
}

export interface RecordAttemptInput {
  notificationId: string;
  providerCode: string;
  channel: Channel;
  attemptNumber: number;
  isFallback: boolean;
  status: AttemptStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  latencyMs: number | null;
  /** Respuesta del proveedor ya sanitizada (sin datos personales). */
  response?: Record<string, unknown> | null;
}

export interface NotificationRepository {
  findByIdempotencyKey(clientAppId: string, key: string): Promise<NotificationRequest | null>;
  /** Guarda la solicitud en RECEIVED y su primera entrada de bitácora en la misma transacción. */
  createReceived(notification: NotificationRequest): Promise<CreateResult>;
  /** Cambia el estado y registra la transición en la bitácora. */
  transition(id: string, from: NotificationStatus, to: NotificationStatus): Promise<void>;
  /** Libera una llave vencida (más de 24 h) para que el cliente pueda reutilizarla. */
  releaseIdempotencyKey(id: string): Promise<void>;
  findDetail(id: string, clientAppId: string): Promise<NotificationDetail | null>;
  /** Para el despachador, que trabaja sin contexto de cliente. */
  findById(id: string): Promise<NotificationRequest | null>;
  /** Guarda el intento y su entrada de bitácora en la misma transacción. */
  recordAttempt(input: RecordAttemptInput): Promise<DeliveryAttempt>;
  /** Lista las notificaciones de un cliente, de la más reciente a la más antigua. */
  list(
    clientAppId: string,
    filter: NotificationListFilter,
    page: { limit: number; cursor?: ListCursor },
  ): Promise<NotificationPage>;
}
