import { Client } from 'pg';
import { deliverWebhook, isUuid, prepareEventDeliveries, publishPendingEvents } from './pipeline';

async function withDatabase<T>(env: Env, work: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      const count = await withDatabase(env, (db) => publishPendingEvents(db, env.WEBHOOK_DELIVERIES));
      console.log(JSON.stringify({ message: 'webhook.outbox_published', count }));
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'webhook.outbox_publish_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const db = new Client({ connectionString: env.HYPERDRIVE.connectionString });
    try {
      await db.connect();
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'webhook.database_connect_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      for (const message of batch.messages) message.retry({ delaySeconds: 30 });
      return;
    }

    try {
      for (const message of batch.messages) {
        const body = message.body as { eventId?: unknown; deliveryId?: unknown } | null;
        const eventId = body?.eventId;
        const deliveryId = body?.deliveryId;
        if (!isUuid(eventId) && !isUuid(deliveryId)) {
          console.error(JSON.stringify({ message: 'webhook.invalid_message', messageId: message.id }));
          message.ack();
          continue;
        }

        try {
          if (isUuid(eventId)) {
            const deliveryIds = await prepareEventDeliveries(db, eventId);
            for (const id of deliveryIds) await env.WEBHOOK_DELIVERIES.send({ deliveryId: id });
            message.ack();
          } else if (isUuid(deliveryId)) {
            const outcome = await deliverWebhook(db, deliveryId);
            if (outcome.result === 'busy' || outcome.result === 'retry') {
              message.retry({ delaySeconds: outcome.retryAfterSeconds });
            } else {
              message.ack();
            }
          }
        } catch (error) {
          console.error(
            JSON.stringify({
              message: 'webhook.delivery_processing_failed',
              ...(isUuid(eventId) ? { eventId } : { deliveryId }),
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          message.retry({ delaySeconds: 30 });
        }
      }
    } finally {
      try {
        await db.end();
      } catch (error) {
        console.error(
          JSON.stringify({
            message: 'webhook.database_close_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  },
} satisfies ExportedHandler<Env>;
