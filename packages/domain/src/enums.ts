export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Estados de una notificación según docs/diagrams/06-estados.mmd. */
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

/** Estado de cada intento de entrega (RF4). */
export const ATTEMPT_STATUSES = ['SENT', 'FAILED', 'RETRYING'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
