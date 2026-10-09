import type { Channel, Message, NotificationRequest, Priority, Recipient, Sender } from '@notifyhub/domain';
import { IdempotencyConflictError } from '@notifyhub/domain';
import type { Clock, IdGenerator, NotificationQueue, NotificationRepository } from '../ports';
import { hashRequest } from '../request-hash';

export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AcceptNotificationInput {
  clientAppId: string;
  idempotencyKey?: string;
  sender: Sender;
  recipient: Recipient;
  message: Message;
  priority: Priority;
  preferredChannel: Channel;
}

export interface AcceptNotificationOutput {
  notification: NotificationRequest;
  /** true cuando la respuesta sale de una solicitud previa con la misma Idempotency-Key. */
  replayed: boolean;
}

/**
 * RF1: recibe la solicitud, la persiste antes de encolarla y la manda a la cola de su prioridad.
 * Si el encolado falla la solicitud queda en RECEIVED y el despachador la recupera; nunca se pierde.
 */
export class AcceptNotification {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly queue: NotificationQueue,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: AcceptNotificationInput): Promise<AcceptNotificationOutput> {
    const { clientAppId, idempotencyKey, ...payload } = input;
    const requestHash = hashRequest(payload);
    const now = this.clock.now();

    if (idempotencyKey) {
      const previous = await this.repository.findByIdempotencyKey(clientAppId, idempotencyKey);
      if (previous) {
        if (now.getTime() - previous.createdAt.getTime() < IDEMPOTENCY_WINDOW_MS) {
          return this.replay(previous, requestHash, idempotencyKey);
        }
        await this.repository.releaseIdempotencyKey(previous.id);
      }
    }

    const result = await this.repository.createReceived({
      id: this.ids.next(),
      clientAppId,
      idempotencyKey: idempotencyKey ?? null,
      requestHash,
      ...payload,
      status: 'RECEIVED',
      createdAt: now,
      updatedAt: now,
    });
    if (!result.created) return this.replay(result.existing, requestHash, idempotencyKey ?? '');

    const notification = result.notification;
    try {
      await this.queue.enqueue(notification.id, notification.priority);
      await this.repository.transition(notification.id, 'RECEIVED', 'QUEUED');
      return { notification: { ...notification, status: 'QUEUED' }, replayed: false };
    } catch {
      return { notification, replayed: false };
    }
  }

  private replay(previous: NotificationRequest, requestHash: string, key: string): AcceptNotificationOutput {
    if (previous.requestHash !== requestHash) throw new IdempotencyConflictError(key);
    return { notification: previous, replayed: true };
  }
}
