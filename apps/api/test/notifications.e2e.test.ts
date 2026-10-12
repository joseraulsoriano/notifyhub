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

const API_KEY = 'nh_test_key_123';
const OTHER_KEY = 'nh_other_key_456';

const validBody = {
  sender: { name: 'Banco Demo', email: 'alertas@banco.demo' },
  recipient: { email: 'ana@example.com', phone: '+5212221234567' },
  message: { subject: 'Cargo detectado', body: 'Se hizo un cargo de $1,200 a tu tarjeta.' },
  priority: 'alta',
  preferredChannel: 'email',
};

describe('API /v1/notifications', () => {
  let app: ReturnType<typeof createApp>;
  let queue: InMemoryNotificationQueue;

  beforeEach(() => {
    queue = new InMemoryNotificationQueue();
    const clients = new InMemoryClientAppRepository();
    clients.add(hashApiKey(API_KEY), { id: 'app-1', name: 'Pruebas', rateLimitPerMin: 5, active: true });
    clients.add(hashApiKey(OTHER_KEY), { id: 'app-2', name: 'Otra app', rateLimitPerMin: 5, active: true });
    const repository = new InMemoryNotificationRepository();
    const deps = {
      config: { RATE_LIMIT_WINDOW_SECONDS: 60, PROVIDER_ADMIN_CLIENTS: '' },
      clients,
      limiter: new InMemoryRateLimiter(),
      accept: new AcceptNotification(repository, queue, new FixedClock(), new SequentialIds()),
      getStatus: new GetNotificationStatus(repository),
      list: new ListNotifications(repository),
      ...providerAndAuditDeps(),
    };
    app = createApp(async () => ({ deps }));
  });

  const post = (
    body: unknown = validBody,
    key: string | null = API_KEY,
    headers: Record<string, string> = {},
  ) =>
    app.request('/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}), ...headers },
      body: JSON.stringify(body),
    });
  const get = (path: string, key = API_KEY) => app.request(path, { headers: { 'X-API-Key': key } });
  /** Los campos que revisan las pruebas, tanto de la notificación como del problem+json. */
  interface Body {
    id: string;
    status: string;
    links: { self: string };
    attempts: unknown[];
    history: { to: string }[];
    errors: { path: string; message: string }[];
  }
  const json = (res: Response) => res.json() as Promise<Body>;

  it('responde 202 con id y la encola en la cola de su prioridad', async () => {
    const res = await post();
    const body = await json(res);

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ status: 'QUEUED', priority: 'HIGH', preferredChannel: 'EMAIL' });
    expect(res.headers.get('location')).toBe(`/v1/notifications/${body.id}`);
    expect(queue.jobs).toEqual([{ notificationId: body.id, priority: 'HIGH' }]);
  });

  it('responde 401 sin API key o con una inválida', async () => {
    const missing = await post(validBody, null);
    const wrong = await post(validBody, 'nh_no_existe');

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('content-type')).toContain('application/problem+json');
  });

  it('responde 400 con el detalle de cada campo inválido', async () => {
    const res = await post({ ...validBody, priority: 'urgente', recipient: { phone: '2221234567' } });
    const body = await json(res);

    expect(res.status).toBe(400);
    const paths = body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['priority', 'recipient.phone']));
  });

  it('exige el dato de contacto del canal preferente', async () => {
    const res = await post({ ...validBody, preferredChannel: 'PUSH' });

    expect(res.status).toBe(400);
    expect((await json(res)).errors).toEqual([
      { path: 'recipient.deviceToken', message: 'el canal PUSH requiere recipient.deviceToken' },
    ]);
  });

  it('rechaza campos desconocidos y cuerpos que no son JSON', async () => {
    const unknownField = await post({ ...validBody, provider: 'twilio' });
    const notJson = await app.request('/v1/notifications', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
      body: 'hola',
    });

    expect(unknownField.status).toBe(400);
    expect(notJson.status).toBe(400);
  });

  it('con la misma Idempotency-Key no genera un segundo envío', async () => {
    const first = await json(await post(validBody, API_KEY, { 'Idempotency-Key': 'pedido-0001' }));
    const second = await post(validBody, API_KEY, { 'Idempotency-Key': 'pedido-0001' });

    expect(second.status).toBe(202);
    expect((await json(second)).id).toBe(first.id);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(queue.jobs).toHaveLength(1);
  });

  it('responde 409 si la Idempotency-Key se reutiliza con otro contenido', async () => {
    await post(validBody, API_KEY, { 'Idempotency-Key': 'pedido-0002' });
    const res = await post({ ...validBody, message: { body: 'otro' } }, API_KEY, {
      'Idempotency-Key': 'pedido-0002',
    });

    expect(res.status).toBe(409);
  });

  it('responde 429 al pasar el límite del cliente e informa los encabezados RateLimit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post()).status);
    const last = await post();

    expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(statuses[5]).toBe(429);
    expect(last.headers.get('retry-after')).not.toBeNull();
    expect(last.headers.get('ratelimit-remaining')).toBe('0');
  });

  it('GET devuelve el estado y el historial, solo al cliente dueño', async () => {
    const created = await json(await post());

    const own = await get(created.links.self);
    const other = await get(created.links.self, OTHER_KEY);
    const body = await json(own);

    expect(own.status).toBe(200);
    expect(body.status).toBe('QUEUED');
    expect(body.attempts).toEqual([]);
    expect(body.history.map((h: { to: string }) => h.to)).toEqual(['RECEIVED', 'QUEUED']);
    expect(other.status).toBe(404);
  });

  it('GET con un id que no es UUID responde 400', async () => {
    const res = await get('/v1/notifications/abc');
    expect(res.status).toBe(400);
  });

  it('/health no pide API key', async () => {
    const res = await app.request('/health');
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
