import type { AttemptStatus, Channel, NotificationStatus, Priority } from './enums';

export interface Sender {
  name: string;
  email?: string;
  phone?: string;
}

/** Destino de la notificación: cada canal usa el campo que le corresponde. */
export interface Recipient {
  email?: string;
  phone?: string;
  deviceToken?: string;
  webhookUrl?: string;
}

export interface Message {
  subject?: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationRequest {
  id: string;
  clientAppId: string;
  idempotencyKey: string | null;
  requestHash: string;
  sender: Sender;
  recipient: Recipient;
  message: Message;
  priority: Priority;
  preferredChannel: Channel;
  status: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryAttempt {
  id: string;
  notificationId: string;
  providerCode: string;
  channel: Channel;
  attemptNumber: number;
  isFallback: boolean;
  status: AttemptStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  latencyMs: number | null;
  attemptedAt: Date;
}

/** Campo de Recipient que exige cada canal. */
export const RECIPIENT_FIELD_BY_CHANNEL: Record<Channel, keyof Recipient> = {
  EMAIL: 'email',
  SMS: 'phone',
  PUSH: 'deviceToken',
  WEBHOOK: 'webhookUrl',
};

export function recipientSupports(recipient: Recipient, channel: Channel): boolean {
  return Boolean(recipient[RECIPIENT_FIELD_BY_CHANNEL[channel]]);
}
