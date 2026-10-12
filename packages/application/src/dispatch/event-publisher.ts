import type { NotificationEvent } from '@notifyhub/domain';

export interface EventSubscriber {
  onEvent(event: NotificationEvent): void | Promise<void>;
}

/**
 * Observer (NH-34): el despachador publica cada cambio de estado e intento sin saber quién escucha
 * (métricas, bitácora, outbox hacia Redis Streams). Un suscriptor que falla no afecta al envío ni a los demás.
 */
export class EventPublisher {
  private readonly subscribers = new Set<EventSubscriber>();

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.unsubscribe(subscriber);
  }

  unsubscribe(subscriber: EventSubscriber): void {
    this.subscribers.delete(subscriber);
  }

  async publish(event: NotificationEvent): Promise<void> {
    await Promise.allSettled([...this.subscribers].map(async (s) => s.onEvent(event)));
  }
}

/** Cuenta eventos por tipo; sirve para pruebas y como base de las métricas. */
export class CountingSubscriber implements EventSubscriber {
  readonly counts = new Map<string, number>();

  onEvent(event: NotificationEvent) {
    this.counts.set(event.type, (this.counts.get(event.type) ?? 0) + 1);
  }
}
