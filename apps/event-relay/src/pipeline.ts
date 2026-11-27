import type { ClientBase } from 'pg';
import { postWebhook, type WebhookEvent } from './webhook';

const OUTBOX_BATCH_SIZE = 100;
const MAX_DELIVERY_ATTEMPTS = 8;

export interface DeliveryQueue {
  send(message: { eventId: string }): Promise<unknown>;
}

interface OutboxRow {
  id: string;
}

interface ClaimedDelivery {
  id: string;
  subscription_id: string;
  target_url: string;
  secret_hash: string;
  attempts: number;
  payload: WebhookEvent;
}

export type DeliveryOutcome =
  | { result: 'delivered' | 'terminal' | 'missing' }
  | { result: 'busy'; retryAfterSeconds: number }
  | { result: 'retry'; retryAfterSeconds: number };

export async function publishPendingEvents(db: ClientBase, queue: DeliveryQueue): Promise<number> {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query<OutboxRow>(
      `SELECT id FROM outbox_event
       WHERE published_at IS NULL
       ORDER BY created_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [OUTBOX_BATCH_SIZE],
    );

    let published = 0;
    for (const event of rows) {
      await queue.send({ eventId: event.id });
      await db.query(`UPDATE outbox_event SET published_at = now() WHERE id = $1`, [event.id]);
      published += 1;
    }

    await db.query('COMMIT');
    return published;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function prepareEventDeliveries(db: ClientBase, eventId: string): Promise<string[]> {
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO subscription_delivery (id, subscription_id, outbox_event_id, status)
       SELECT gen_random_uuid(), s.id, e.id, 'PENDING'
       FROM outbox_event e
       JOIN notification n ON n.id = e.notification_id
       JOIN subscription s ON s.client_app_id = n.client_app_id
       WHERE e.id = $1 AND s.active AND e.event_type = ANY(s.event_types)
       ON CONFLICT (subscription_id, outbox_event_id) DO NOTHING`,
      [eventId],
    );
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM subscription_delivery
       WHERE outbox_event_id = $1 AND status IN ('PENDING', 'PROCESSING')
       ORDER BY id`,
      [eventId],
    );
    await db.query('COMMIT');
    return rows.map(({ id }) => id);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function deliverWebhook(
  db: ClientBase,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryOutcome> {
  await db.query(
    `UPDATE subscription_delivery SET status = 'FAILED'
     WHERE id = $1 AND attempts >= $2
       AND (status = 'PENDING'
         OR (status = 'PROCESSING' AND last_attempt_at < now() - interval '2 minutes'))`,
    [deliveryId, MAX_DELIVERY_ATTEMPTS],
  );

  const { rows } = await db.query<ClaimedDelivery>(
    `UPDATE subscription_delivery d
     SET status = 'PROCESSING', attempts = d.attempts + 1, last_attempt_at = now()
     FROM subscription s, outbox_event e
     WHERE d.id = $1 AND s.id = d.subscription_id AND e.id = d.outbox_event_id AND s.active
       AND d.attempts < $2
       AND (d.status = 'PENDING'
         OR (d.status = 'PROCESSING' AND d.last_attempt_at < now() - interval '2 minutes'))
     RETURNING d.id, d.subscription_id, s.target_url, s.secret_hash, d.attempts, e.payload`,
    [deliveryId, MAX_DELIVERY_ATTEMPTS],
  );

  const delivery = rows[0];
  if (!delivery) {
    await db.query(
      `UPDATE subscription_delivery d SET status = 'CANCELLED'
       FROM subscription s
       WHERE d.id = $1 AND s.id = d.subscription_id AND NOT s.active AND d.status = 'PENDING'`,
      [deliveryId],
    );
    const { rows: current } = await db.query<{ status: string }>(
      `SELECT status FROM subscription_delivery WHERE id = $1`,
      [deliveryId],
    );
    const status = current[0]?.status;
    if (!status) return { result: 'missing' };
    if (status === 'PROCESSING') return { result: 'busy', retryAfterSeconds: 30 };
    return { result: 'terminal' };
  }

  let succeeded = false;
  let failure: unknown;
  try {
    const response = await postWebhook(
      {
        subscriptionId: delivery.subscription_id,
        targetUrl: delivery.target_url,
        secretHash: delivery.secret_hash,
        event: delivery.payload,
      },
      fetcher,
    );
    succeeded = response.ok;
    if (!succeeded) failure = new Error(`El webhook respondió HTTP ${response.status}`);
  } catch (error) {
    failure = error;
  }

  if (succeeded) {
    await db.query(
      `UPDATE subscription_delivery SET status = 'DELIVERED'
       WHERE id = $1 AND status = 'PROCESSING'`,
      [delivery.id],
    );
    return { result: 'delivered' };
  }

  const terminal = delivery.attempts >= MAX_DELIVERY_ATTEMPTS;
  await db.query(
    `UPDATE subscription_delivery SET status = $2
     WHERE id = $1 AND status = 'PROCESSING'`,
    [delivery.id, terminal ? 'FAILED' : 'PENDING'],
  );
  console.error(
    JSON.stringify({
      message: 'webhook.delivery_failed',
      deliveryId: delivery.id,
      attempts: delivery.attempts,
      terminal,
      error: failure instanceof Error ? failure.message : String(failure),
    }),
  );

  return terminal
    ? { result: 'terminal' }
    : { result: 'retry', retryAfterSeconds: Math.min(2 ** (delivery.attempts - 1), 300) };
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}
