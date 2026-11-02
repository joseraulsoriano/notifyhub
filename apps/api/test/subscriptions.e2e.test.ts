import {
  AcceptNotification,
  FixedClock,
  GetNotificationStatus,
  hashApiKey,
  InMemoryClientAppRepository,
  InMemoryNotificationQueue,
  InMemoryNotificationRepository,
  InMemoryRateLimiter,
  ListNotifications,
  SequentialIds,
} from '@notifyhub/application';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { providerAndAuditDeps } from './support';

const KEY = 'nh_subscription_key';
const OTHER_KEY = 'nh_other_subscription_key';

describe('API /v1/subscriptions', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const clients = new InMemoryClientAppRepository();
    clients.add(hashApiKey(KEY), { id: 'app-1', name: 'Cliente A', rateLimitPerMin: 100, active: true });
    clients.add(hashApiKey(OTHER_KEY), {
      id: 'app-2',
      name: 'Cliente B',
      rateLimitPerMin: 100,
      active: true,
    });
    const repository = new InMemoryNotificationRepository();
    const deps = {
      config: { RATE_LIMIT_WINDOW_SECONDS: 60, PROVIDER_ADMIN_CLIENTS: '' },
      clients,
      limiter: new InMemoryRateLimiter(),
      accept: new AcceptNotification(
        repository,
        new InMemoryNotificationQueue(),
        new FixedClock(),
        new SequentialIds(),
      ),
      getStatus: new GetNotificationStatus(repository),
      list: new ListNotifications(repository),
      ...providerAndAuditDeps(),
    };
    app = createApp(async () => ({ deps }));
  });

  const request = (path: string, key = KEY, method = 'GET', body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('creates a tenant-scoped webhook and returns its signing secret only once', async () => {
    const create = await request('/v1/subscriptions', KEY, 'POST', {
      subscriberName: 'ERP',
      targetUrl: 'https://erp.example.com/events',
      eventTypes: ['notification.status_changed'],
    });
    const created = (await create.json()) as {
      id: string;
      active: boolean;
      signingSecret: string;
      secretHash?: string;
    };

    expect(create.status).toBe(201);
    expect(created).toMatchObject({ active: true });
    expect(created.signingSecret).toMatch(/^nhs_[A-Za-z0-9_-]+$/);
    expect(created).not.toHaveProperty('secretHash');

    const mine = (await (await request('/v1/subscriptions')).json()) as { items: { id: string }[] };
    const other = (await (await request('/v1/subscriptions', OTHER_KEY)).json()) as { items: unknown[] };
    expect(mine.items.map((item) => item.id)).toContain(created.id);
    expect(JSON.stringify(mine)).not.toContain(created.signingSecret);
    expect(other.items).toEqual([]);
  });

  it('validates webhook URL and event types', async () => {
    const response = await request('/v1/subscriptions', KEY, 'POST', {
      subscriberName: 'ERP',
      targetUrl: 'http://erp.example.com/events',
      eventTypes: ['unknown'],
    });

    expect(response.status).toBe(400);
  });

  it('changes active state only for the owning client', async () => {
    const create = await request('/v1/subscriptions', KEY, 'POST', {
      subscriberName: 'ERP',
      targetUrl: 'https://erp.example.com/events',
      eventTypes: ['notification.attempted'],
    });
    const created = (await create.json()) as { id: string };

    expect(
      (await request(`/v1/subscriptions/${created.id}`, OTHER_KEY, 'PATCH', { active: false })).status,
    ).toBe(404);
    const update = await request(`/v1/subscriptions/${created.id}`, KEY, 'PATCH', { active: false });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ id: created.id, active: false });
  });
});
