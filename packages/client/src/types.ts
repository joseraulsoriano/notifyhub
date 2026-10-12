/** Tipos del contrato de la API (docs/api/openapi.yaml). Sin dependencias del resto del monorepo. */

export const CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'] as const;
export type Channel = (typeof CHANNELS)[number];

export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const NOTIFICATION_STATUSES = [
  'RECEIVED',
  'QUEUED',
  'SENDING',
  'RETRYING',
  'FALLBACK',
  'SENT',
  'DELIVERED',
  'FAILED',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export type AttemptStatus = 'SENT' | 'FAILED' | 'RETRYING';
export type ProviderHealth = 'UP' | 'DEGRADED' | 'DOWN';

/** Estados de los que ya no sale una notificación. */
export const TERMINAL_STATUSES: readonly NotificationStatus[] = ['SENT', 'DELIVERED', 'FAILED'];
export const isTerminal = (status: NotificationStatus) => TERMINAL_STATUSES.includes(status);

export interface CreateNotificationInput {
  sender: { name: string; email?: string; phone?: string };
  /** Cada canal usa su campo: EMAIL→email, SMS→phone, PUSH→deviceToken, WEBHOOK→webhookUrl. */
  recipient: { email?: string; phone?: string; deviceToken?: string; webhookUrl?: string };
  message: { subject?: string; body: string; data?: Record<string, string> };
  /** También acepta "alta", "media" y "baja". */
  priority: Priority | 'alta' | 'media' | 'baja';
  preferredChannel: Channel;
}

export interface NotificationSummary {
  id: string;
  status: NotificationStatus;
  priority: Priority;
  preferredChannel: Channel;
  createdAt: string;
  links: { self: string };
}

/** Respuesta de crear: `replayed` es true si se reprodujo una solicitud previa con la misma Idempotency-Key. */
export interface CreatedNotification extends NotificationSummary {
  replayed: boolean;
}

/** Fila de la lista: el contacto viene enmascarado. */
export interface NotificationListItem extends NotificationSummary {
  updatedAt: string;
  subject: string | null;
  preview: string;
  recipient: string;
  idempotencyKey: string | null;
  attemptCount: number;
  usedFallback: boolean;
  finalChannel: Channel | null;
  totalLatencyMs: number;
}

export interface DeliveryAttempt {
  attemptNumber: number;
  provider: string;
  channel: Channel;
  status: AttemptStatus;
  isFallback: boolean;
  providerMessageId: string | null;
  errorCode: string | null;
  latencyMs: number | null;
  attemptedAt: string;
}

export interface NotificationDetail extends NotificationSummary {
  updatedAt: string;
  attempts: DeliveryAttempt[];
  history: { from: NotificationStatus | null; to: NotificationStatus; at: string }[];
}

export interface Provider {
  code: string;
  channel: Channel;
  costPerMessage: number;
  reliabilityScore: number;
  health: ProviderHealth;
  enabled: boolean;
}

export interface AuditEntry {
  id: string;
  notificationId: string;
  eventType: string;
  fromStatus: NotificationStatus | null;
  toStatus: NotificationStatus;
  channel: Channel | null;
  providerCode: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: string;
}

export interface Page<T> {
  items: T[];
  /** Pásalo como `cursor` para pedir la página siguiente; null en la última. */
  nextCursor: string | null;
}

export interface ListNotificationsQuery {
  status?: NotificationStatus;
  channel?: Channel;
  priority?: Priority;
  /** Busca en asunto, cuerpo, id e Idempotency-Key. */
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface ListAuditLogQuery {
  notificationId?: string;
  eventType?: string;
  channel?: Channel;
  provider?: string;
  status?: AttemptStatus;
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  cursor?: string;
}

/**
 * Lo que consumen la UI y las aplicaciones. La implementa `createNotifyHubClient` contra la API real; una
 * aplicación puede entregar otra implementación (por ejemplo una simulada para demostraciones).
 */
export interface NotifyHubClient {
  health(): Promise<{ status: string }>;
  notifications: {
    create(
      input: CreateNotificationInput,
      options?: { idempotencyKey?: string },
    ): Promise<CreatedNotification>;
    get(id: string): Promise<NotificationDetail>;
    list(query?: ListNotificationsQuery): Promise<Page<NotificationListItem>>;
  };
  providers: {
    list(): Promise<Provider[]>;
    /** Requiere un cliente autorizado en el servidor (PROVIDER_ADMIN_CLIENTS). */
    update(code: string, patch: { health?: ProviderHealth; enabled?: boolean }): Promise<Provider>;
  };
  auditLog: {
    list(query?: ListAuditLogQuery): Promise<Page<AuditEntry>>;
  };
}
