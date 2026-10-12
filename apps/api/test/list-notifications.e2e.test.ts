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

const KEY = 'nh_test_key_123';
const OTHER_KEY = 'nh_other_key_456';

const body = (over: Record<string, unknown> = {}) => ({
  sender: { name: 'Banco Demo' },
  recipient: {
    email: 'ana.lopez@example.com',
    phone: '+5215512345678',
    deviceToken: 'fcm:APA91bHe41a0000',
    webhookUrl: 'https://erp.cliente.mx/hook/secreto',
  },
  message: { subject: 'Cargo detectado', body: 'Se hizo un cargo de $1,200 a tu tarjeta.' },
  priority: 'alta',
  preferredChannel: 'email',
  ...over,
});

interface Item {
  id: string;
  status: string;
  subject: string | null;
  preview: string;
  recipient: string;
  preferredChannel: string;
  priority: string;
  attemptCount: number;
  usedFallback: boolean;
}
interface Page {
  items: Item[];
  nextCursor: string | null;
  errors?: { path: string }[];
}

describe('GET /v1/notifications', () => {
  let app: ReturnType<typeof createApp>;
  let clock: FixedClock;

  beforeEach(() => {
    const clients = new InMemoryClientAppRepository();
    clients.add(hashApiKey(KEY), { id: 'app-1', name: 'Pruebas', rateLimitPerMin: 1000, active: true });
    clients.add(hashApiKey(OTHER_KEY), {
      id: 'app-2',
      name: 'Otra app',
      rateLimitPerMin: 1000,
      active: true,
    });
    const repository = new InMemoryNotificationRepository();
    clock = new FixedClock();
    const deps = {
      config: { RATE_LIMIT_WINDOW_SECONDS: 60, PROVIDER_ADMIN_CLIENTS: '' },
      clients,
      limiter: new InMemoryRateLimiter(),
      accept: new AcceptNotification(repository, new InMemoryNotificationQueue(), clock, new SequentialIds()),
      getStatus: new GetNotificationStatus(repository),
      list: new ListNotifications(repository),
      ...providerAndAuditDeps(),
    };
    app = createApp(async () => ({ deps }));
  });

  const post = async (payload: unknown, key = KEY) => {
    clock.advance(1000); // cada notificación con una fecha distinta
    const res = await app.request('/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(202);
  };
  const list = async (query = '', key: string | null = KEY) => {
    const res = await app.request(`/v1/notifications${query}`, { headers: key ? { 'X-API-Key': key } : {} });
    return { res, page: (await res.json()) as Page };
  };

  it('exige API key', async () => {
    const { res } = await list('', null);
    expect(res.status).toBe(401);
  });

  it('lista de la más reciente a la más antigua y enmascara los datos de contacto', async () => {
    await post(body({ message: { subject: 'Primera', body: 'a' } }));
    await post(body({ message: { subject: 'Segunda', body: 'b' } }));
    const { res, page } = await list();
    expect(res.status).toBe(200);
    expect(page.items.map((i) => i.subject)).toEqual(['Segunda', 'Primera']);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      recipient: 'a***@example.com',
      status: 'QUEUED',
      attemptCount: 0,
      usedFallback: false,
    });
    const raw = JSON.stringify(page);
    expect(raw).not.toContain('ana.lopez');
    expect(raw).not.toContain('5512345678');
  });

  it('enmascara el contacto según el canal', async () => {
    await post(body({ preferredChannel: 'sms' }));
    await post(body({ preferredChannel: 'push' }));
    await post(body({ preferredChannel: 'webhook' }));
    const { page } = await list();
    expect(page.items.map((i) => i.recipient)).toEqual([
      'https://erp.cliente.mx/…',
      'fcm:••••0000',
      '+52 ****-5678',
    ]);
  });

  it('solo muestra las notificaciones del cliente autenticado', async () => {
    await post(body());
    await post(body({ message: { subject: 'De otra app', body: 'x' } }), OTHER_KEY);
    expect((await list()).page.items).toHaveLength(1);
    expect((await list('', OTHER_KEY)).page.items.map((i) => i.subject)).toEqual(['De otra app']);
  });

  it('filtra por canal, prioridad, estado y texto', async () => {
    await post(body({ preferredChannel: 'email', priority: 'alta' }));
    await post(
      body({
        preferredChannel: 'sms',
        priority: 'baja',
        message: { subject: 'Oferta', body: 'Descuento del 20%' },
      }),
    );
    expect((await list('?channel=SMS')).page.items).toHaveLength(1);
    expect((await list('?priority=alta')).page.items).toHaveLength(1);
    expect((await list('?status=queued')).page.items).toHaveLength(2);
    expect((await list('?status=DELIVERED')).page.items).toHaveLength(0);
    expect((await list('?q=descuento')).page.items.map((i) => i.subject)).toEqual(['Oferta']);
  });

  it('pagina con cursor sin repetir ni saltar filas', async () => {
    for (let i = 1; i <= 5; i++) await post(body({ message: { subject: `N${i}`, body: 'x' } }));
    const first = (await list('?limit=2')).page;
    expect(first.items.map((i) => i.subject)).toEqual(['N5', 'N4']);
    expect(first.nextCursor).toBeTruthy();
    const second = (await list(`?limit=2&cursor=${first.nextCursor}`)).page;
    expect(second.items.map((i) => i.subject)).toEqual(['N3', 'N2']);
    const third = (await list(`?limit=2&cursor=${second.nextCursor}`)).page;
    expect(third.items.map((i) => i.subject)).toEqual(['N1']);
    expect(third.nextCursor).toBeNull();
  });

  it('rechaza cursor y filtros inválidos con 400', async () => {
    expect((await list('?cursor=basura')).res.status).toBe(400);
    expect((await list('?status=NOPE')).res.status).toBe(400);
    expect((await list('?limit=1000')).res.status).toBe(400);
  });

  describe('CORS', () => {
    const preflight = (origin: string, env?: object) =>
      app.request(
        '/v1/notifications',
        {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'x-api-key',
          },
        },
        env,
      );

    it('no envía encabezados CORS si no hay orígenes configurados', async () => {
      const res = await preflight('https://consola.example');
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('permite solo los orígenes configurados', async () => {
      const env = { CORS_ALLOWED_ORIGINS: 'https://consola.example, http://localhost:4321' };
      expect(
        (await preflight('https://consola.example', env)).headers.get('access-control-allow-origin'),
      ).toBe('https://consola.example');
      expect(
        (await preflight('https://malo.example', env)).headers.get('access-control-allow-origin'),
      ).toBeNull();
      expect(
        (await preflight('https://consola.example', env)).headers.get('access-control-allow-headers'),
      ).toContain('X-API-Key');
    });
  });
});
