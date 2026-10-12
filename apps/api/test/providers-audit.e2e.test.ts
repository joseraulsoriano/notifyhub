import {
  AcceptNotification,
  FixedClock,
  GetNotificationStatus,
  hashApiKey,
  InMemoryAuditLogRepository,
  InMemoryClientAppRepository,
  InMemoryNotificationQueue,
  InMemoryNotificationRepository,
  InMemoryProviderRepository,
  InMemoryRateLimiter,
  ListNotifications,
  SequentialIds,
  type AuditEntry,
} from '@notifyhub/application';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { providerAndAuditDeps } from './support';

const ADMIN_KEY = 'nh_admin_key_123';
const USER_KEY = 'nh_user_key_456';

const entry = (id: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: String(id),
  notificationId: '00000000-0000-4000-8000-000000000001',
  eventType: 'notification.status_changed',
  fromStatus: 'QUEUED',
  toStatus: 'SENDING',
  channel: null,
  providerCode: null,
  detail: null,
  occurredAt: new Date(Date.UTC(2026, 9, 12, 15, 0, id)),
  ...over,
});

describe('proveedores y bitácora', () => {
  let app: ReturnType<typeof createApp>;
  let providers: InMemoryProviderRepository;
  let audit: InMemoryAuditLogRepository;

  const build = (adminClients: string) => {
    const clients = new InMemoryClientAppRepository();
    clients.add(hashApiKey(ADMIN_KEY), {
      id: 'app-admin',
      name: 'Consola',
      rateLimitPerMin: 1000,
      active: true,
    });
    clients.add(hashApiKey(USER_KEY), {
      id: 'app-user',
      name: 'Cliente',
      rateLimitPerMin: 1000,
      active: true,
    });
    const repository = new InMemoryNotificationRepository();
    const deps = {
      config: { RATE_LIMIT_WINDOW_SECONDS: 60, PROVIDER_ADMIN_CLIENTS: adminClients },
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
      ...providerAndAuditDeps(providers, audit),
    };
    app = createApp(async () => ({ deps }));
  };

  beforeEach(() => {
    providers = new InMemoryProviderRepository();
    audit = new InMemoryAuditLogRepository();
    build('Consola');
  });

  const call = (path: string, key: string | null = ADMIN_KEY, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
    });
  const patch = (code: string, body: unknown, key: string | null = ADMIN_KEY) =>
    call(`/v1/providers/${code}`, key, { method: 'PATCH', body: JSON.stringify(body) });

  describe('GET /v1/providers', () => {
    it('lista el catálogo con su salud', async () => {
      const res = await call('/v1/providers');
      const body = (await res.json()) as { items: { code: string; health: string; enabled: boolean }[] };

      expect(res.status).toBe(200);
      expect(body.items.map((p) => p.code).sort()).toEqual(['fcm', 'sendgrid', 'twilio', 'webhook']);
      expect(body.items.every((p) => p.health === 'UP' && p.enabled)).toBe(true);
    });

    it('exige API key', async () => {
      expect((await call('/v1/providers', null)).status).toBe(401);
    });
  });

  describe('PATCH /v1/providers/{code}', () => {
    it('cambia la salud de un proveedor (cliente administrador, por nombre)', async () => {
      const res = await patch('fcm', { health: 'down' });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ code: 'fcm', health: 'DOWN', enabled: true });
      expect((await providers.list()).find((p) => p.code === 'fcm')?.health).toBe('DOWN');
    });

    it('permite deshabilitar un proveedor', async () => {
      expect(await (await patch('twilio', { enabled: false })).json()).toMatchObject({
        code: 'twilio',
        enabled: false,
      });
    });

    it('un cliente que no es administrador recibe 403 y no cambia nada', async () => {
      const res = await patch('fcm', { health: 'DOWN' }, USER_KEY);
      expect(res.status).toBe(403);
      expect((await providers.list()).find((p) => p.code === 'fcm')?.health).toBe('UP');
    });

    it('con PROVIDER_ADMIN_CLIENTS vacío nadie puede modificar', async () => {
      build('');
      expect((await patch('fcm', { health: 'DOWN' })).status).toBe(403);
    });

    it('con "*" cualquier cliente puede (solo para entornos de demostración)', async () => {
      build('*');
      expect((await patch('fcm', { health: 'DEGRADED' }, USER_KEY)).status).toBe(200);
    });

    it('también acepta el id del cliente', async () => {
      build('app-user');
      expect((await patch('fcm', { health: 'DOWN' }, USER_KEY)).status).toBe(200);
      expect((await patch('fcm', { health: 'DOWN' }, ADMIN_KEY)).status).toBe(403);
    });

    it('404 si el proveedor no existe', async () => {
      expect((await patch('inexistente', { enabled: false })).status).toBe(404);
    });

    it.each([{}, { health: 'MUERTO' }, { enabled: 'si' }, { health: 'UP', extra: 1 }])(
      '400 con cuerpo inválido %j',
      async (body) => {
        expect((await patch('fcm', body)).status).toBe(400);
      },
    );

    it('400 con código de proveedor inválido', async () => {
      expect((await patch('FCM%20;DROP', { enabled: false })).status).toBe(400);
    });
  });

  describe('GET /v1/audit-log', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) audit.add('app-admin', entry(i));
      audit.add(
        'app-admin',
        entry(6, {
          eventType: 'delivery.attempt',
          channel: 'PUSH',
          providerCode: 'fcm',
          detail: { status: 'FAILED' },
        }),
      );
      audit.add('app-user', entry(7, { notificationId: '00000000-0000-4000-8000-000000000002' }));
    });

    interface Page {
      items: { id: string; eventType: string }[];
      nextCursor: string | null;
    }
    const get = async (query = '', key: string | null = ADMIN_KEY) => {
      const res = await call(`/v1/audit-log${query}`, key);
      return { res, page: (await res.json()) as Page };
    };

    it('devuelve solo las entradas del cliente, de la más reciente a la más antigua', async () => {
      const { res, page } = await get();
      expect(res.status).toBe(200);
      expect(page.items.map((e) => e.id)).toEqual(['6', '5', '4', '3', '2', '1']);
      expect((await get('', USER_KEY)).page.items.map((e) => e.id)).toEqual(['7']);
    });

    it('filtra por evento, canal, proveedor y estado del intento', async () => {
      expect((await get('?eventType=delivery.attempt')).page.items.map((e) => e.id)).toEqual(['6']);
      expect((await get('?channel=push')).page.items).toHaveLength(1);
      expect((await get('?provider=fcm&status=failed')).page.items).toHaveLength(1);
      expect((await get('?provider=twilio')).page.items).toHaveLength(0);
    });

    it('filtra por notificación y por rango de fechas', async () => {
      expect((await get('?notificationId=00000000-0000-4000-8000-000000000002')).page.items).toHaveLength(0);
      expect((await get('?from=2026-10-12T15:00:04Z')).page.items.map((e) => e.id)).toEqual(['6', '5', '4']);
      expect((await get('?to=2026-10-12T15:00:02Z')).page.items.map((e) => e.id)).toEqual(['2', '1']);
    });

    it('pagina con cursor sin repetir ni saltar entradas', async () => {
      const first = (await get('?limit=4')).page;
      expect(first.items.map((e) => e.id)).toEqual(['6', '5', '4', '3']);
      const second = (await get(`?limit=4&cursor=${first.nextCursor}`)).page;
      expect(second.items.map((e) => e.id)).toEqual(['2', '1']);
      expect(second.nextCursor).toBeNull();
    });

    it('rechaza cursor y filtros inválidos con 400', async () => {
      expect((await get('?cursor=basura')).res.status).toBe(400);
      expect((await get('?status=NOPE')).res.status).toBe(400);
      expect((await get('?notificationId=no-es-uuid')).res.status).toBe(400);
      expect((await get('?limit=500')).res.status).toBe(400);
    });

    it('exige API key', async () => {
      expect((await get('', null)).res.status).toBe(401);
    });
  });
});
