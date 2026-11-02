import {
  DEFAULT_ROUTING,
  DispatchService,
  EventPublisher,
  FallbackPolicy,
  strategyFor,
  type EventSubscriber,
} from '@notifyhub/application';
import {
  PgDispatchCapacityRepository,
  PgNotificationRepository,
  PgProviderRepository,
} from '@notifyhub/persistence';
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
  return typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
    ? { notificationId: id }
    : null;
}

async function processMessage(message: Message, queue: string, env: Env): Promise<void> {
  const job = parseJob(message.body);
  if (!job) {
    console.error(JSON.stringify({ message: 'dispatch.invalid_message', queue, messageId: message.id }));
    message.ack();
    return;
  }

  const db = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  let connected = false;
  try {
    await db.connect();
    connected = true;
    const publisher = new EventPublisher();
    publisher.subscribe(logSubscriber);
    const service = new DispatchService({
      notifications: new PgNotificationRepository(db),
      providers: new PgProviderRepository(db),
      capacity: new PgDispatchCapacityRepository(db),
      registry: createDefaultRegistry(),
      fallback: new FallbackPolicy(DEFAULT_ROUTING.fallback),
      strategyFor: (priority) =>
        strategyFor(DEFAULT_ROUTING.strategy[priority], DEFAULT_ROUTING.providerOrder),
      retry: DEFAULT_ROUTING.retry,
      publisher,
      clock: { now: () => new Date() },
    });

    const outcome = await service.dispatch(job.notificationId, queue);
    console.log(
      JSON.stringify({ message: 'dispatch.finished', queue, notificationId: job.notificationId, ...outcome }),
    );
    if (outcome.result === 'busy') {
      message.retry({ delaySeconds: DEFAULT_ROUTING.busyDispatchRetrySeconds });
    } else {
      message.ack();
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'dispatch.failed',
        queue,
        notificationId: job.notificationId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    message.retry({ delaySeconds: 10 });
  } finally {
    if (connected) {
      try {
        await db.end();
      } catch (error) {
        console.error(
          JSON.stringify({
            message: 'dispatch.database_close_failed',
            queue,
            notificationId: job.notificationId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }
}

export default {
  /**
   * Los mensajes de las tres colas se procesan con concurrencia acotada; cada uno tiene su propio
   * cliente PostgreSQL. El semáforo compartido en Postgres impone el límite global por proveedor.
   */
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const messages = [...batch.messages];
    let next = 0;
    const worker = async () => {
      while (next < messages.length) {
        const index = next++;
        await processMessage(messages[index]!, batch.queue, env);
      }
    };
    const concurrency = Math.min(DEFAULT_ROUTING.batchConcurrency, messages.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  },
} satisfies ExportedHandler<Env>;
