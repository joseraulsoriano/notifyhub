import { createHash, createHmac } from 'node:crypto';
import type { ClientBase } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverWebhook, prepareEventDeliveries, publishPendingEvents } from '../src/pipeline';
import { postWebhook, signWebhookPayload } from '../src/webhook';

const SECRET = 'nhs_test-signing-secret';
const SECRET_HASH = createHash('sha256').update(SECRET).digest('hex');
const EVENT = { id: 'event-1', type: 'notification.status_changed', to: 'SENT' };
const MAX_ATTEMPTS = 8;

function fakeDatabase(
  query: (sql: string, values?: unknown[]) => { rows?: unknown[]; rowCount?: number },
): ClientBase {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => ({
      rows: [],
      rowCount: 0,
      ...query(sql, values),
    })),
  } as unknown as ClientBase;
}

describe('webhook event relay', () => {
  afterEach(() => vi.restoreAllMocks());

  it('signs the exact JSON body with the stored SHA-256 secret digest', async () => {
    const body = JSON.stringify(EVENT);
    const expected = createHmac('sha256', Buffer.from(SECRET_HASH, 'hex')).update(body).digest('hex');

    await expect(signWebhookPayload(SECRET_HASH, body)).resolves.toBe(`sha256=${expected}`);
  });

  it('posts the event with its signature and stable event id', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );

    const response = await postWebhook(
      {
        subscriptionId: 'subscription-1',
        targetUrl: 'https://hooks.example.test/events',
        secretHash: SECRET_HASH,
        event: EVENT,
      },
      fetcher,
    );

    expect(response.status).toBe(204);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://hooks.example.test/events');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(EVENT));
    expect(new Headers(init?.headers).get('X-NotifyHub-Event-Id')).toBe(EVENT.id);
    expect(new Headers(init?.headers).get('X-NotifyHub-Subscription-Id')).toBe('subscription-1');
    expect(new Headers(init?.headers).get('X-Signature')).toBe(
      `sha256=${createHmac('sha256', Buffer.from(SECRET_HASH, 'hex')).update(JSON.stringify(EVENT)).digest('hex')}`,
    );
    expect(init?.redirect).toBe('manual');
  });

  it('publishes the outbox event id before marking the event published', async () => {
    const db = fakeDatabase((sql) => {
      if (sql.includes('SELECT id FROM outbox_event')) return { rows: [{ id: 'event-1' }] };
      return {};
    });
    const queue = { send: vi.fn(async () => {}) };

    await expect(publishPendingEvents(db, queue)).resolves.toBe(1);

    expect(queue.send).toHaveBeenCalledWith({ eventId: 'event-1' });
    expect(db.query).toHaveBeenCalledWith('COMMIT');
  });

  it('creates one delivery for each matching active subscription idempotently', async () => {
    const db = fakeDatabase((sql) => {
      if (sql.includes('SELECT id FROM subscription_delivery')) {
        return { rows: [{ id: 'delivery-1' }, { id: 'delivery-2' }] };
      }
      return {};
    });

    await expect(prepareEventDeliveries(db, 'event-1')).resolves.toEqual(['delivery-1', 'delivery-2']);

    expect(db.query).toHaveBeenCalledWith('COMMIT');
  });

  it('retries failed destinations and records successful ones as delivered', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const createDeliveryDb = (attempts = 1) => {
      let deliveryStatus = 'PENDING';
      const db = fakeDatabase((sql, values) => {
        if (sql.includes("SET status = 'FAILED'") && attempts >= MAX_ATTEMPTS) deliveryStatus = 'FAILED';
        if (
          sql.includes("SET status = 'PROCESSING'") &&
          deliveryStatus === 'PENDING' &&
          attempts < MAX_ATTEMPTS
        ) {
          deliveryStatus = 'PROCESSING';
          return {
            rows: [
              {
                id: 'delivery-1',
                subscription_id: 'subscription-1',
                target_url: 'https://hooks.example.test/events',
                secret_hash: SECRET_HASH,
                attempts,
                payload: EVENT,
              },
            ],
          };
        }
        if (sql.includes('SET status = $2')) deliveryStatus = String(values?.[1]);
        if (sql.includes("SET status = 'DELIVERED'")) deliveryStatus = 'DELIVERED';
        if (sql.includes('SELECT status FROM subscription_delivery'))
          return { rows: [{ status: deliveryStatus }] };
        return {};
      });
      return { db, getStatus: () => deliveryStatus };
    };

    const failed = createDeliveryDb();
    await expect(
      deliverWebhook(failed.db, 'delivery-1', async () => new Response(null, { status: 503 })),
    ).resolves.toEqual({
      result: 'retry',
      retryAfterSeconds: 1,
    });
    expect(failed.getStatus()).toBe('PENDING');

    const delivered = createDeliveryDb();
    await expect(
      deliverWebhook(delivered.db, 'delivery-1', async () => new Response(null, { status: 204 })),
    ).resolves.toEqual({
      result: 'delivered',
    });
    expect(delivered.getStatus()).toBe('DELIVERED');

    const exhausted = createDeliveryDb(MAX_ATTEMPTS);
    await expect(
      deliverWebhook(exhausted.db, 'delivery-1', async () => new Response(null, { status: 503 })),
    ).resolves.toEqual({ result: 'terminal' });
    expect(exhausted.getStatus()).toBe('FAILED');
  });
});
