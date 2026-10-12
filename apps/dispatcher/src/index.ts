import {
  DEFAULT_ROUTING,
  DispatchService,
  EventPublisher,
  FallbackPolicy,
  strategyFor,
  type EventSubscriber,
} from '@notifyhub/application';
import { PgNotificationRepository, PgProviderRepository } from '@notifyhub/persistence';
import { createDefaultRegistry } from '@notifyhub/providers';
import type { DispatchJobData } from '@notifyhub/shared';
import { Client } from 'pg';

/** Observer de ejemplo: cada evento sale como una línea JSON en los logs de Workers. */
const logSubscriber: EventSubscriber = {
  onEvent(event) {
    console.log(JSON.stringify({ ...event, occurredAt: event.occurredAt.toISOString() }));
  },
};

/** El cuerpo llega de la cola, así que se valida en vez de suponer su forma. */
function parseJob(body: unknown): DispatchJobData | null {
  const id = (body as { notificationId?: unknown } | null)?.notificationId;
  return typeof id === 'string' && id.length > 0 ? { notificationId: id } : null;
}

export default {
  /**
   * Consume un lote de `notifications-{high,medium,low}`. Cada mensaje es un id de notificación; el
   * `DispatchService` hace el envío, los reintentos y el fallback. Si algo inesperado falla (por ejemplo la
   * base de datos), el mensaje se reintenta; Queues entrega al menos una vez y el servicio ignora duplicados.
   */
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const db = new Client({ connectionString: env.HYPERDRIVE.connectionString });
    await db.connect();
    try {
      const publisher = new EventPublisher();
      publisher.subscribe(logSubscriber);

      const service = new DispatchService({
        notifications: new PgNotificationRepository(db),
        providers: new PgProviderRepository(db),
        registry: createDefaultRegistry(),
        fallback: new FallbackPolicy(DEFAULT_ROUTING.fallback),
        strategyFor: (priority) =>
          strategyFor(DEFAULT_ROUTING.strategy[priority], DEFAULT_ROUTING.providerOrder),
        retry: DEFAULT_ROUTING.retry,
        publisher,
        clock: { now: () => new Date() },
      });

      // En orden, no en paralelo: comparten una conexión y cada paso usa transacciones.
      for (const message of batch.messages) {
        const job = parseJob(message.body);
        if (!job) {
          console.error('mensaje inválido descartado', message.id);
          message.ack(); // reintentarlo no lo arreglaría
          continue;
        }
        try {
          const outcome = await service.dispatch(job.notificationId);
          console.log(JSON.stringify({ queue: batch.queue, notificationId: job.notificationId, ...outcome }));
          message.ack();
        } catch (error) {
          console.error('despacho fallido', job.notificationId, error);
          message.retry({ delaySeconds: 10 });
        }
      }
    } finally {
      await db.end();
    }
  },
} satisfies ExportedHandler<Env>;
