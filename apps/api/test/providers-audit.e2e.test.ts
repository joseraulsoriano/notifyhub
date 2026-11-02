import {
  AcceptNotification,
  FixedClock,
  GetNotificationStatus,
  hashApiKey,
  InMemoryAuditLogRepository,
  InMemoryClientAppRepository,
  InMemoryDispatchCapacityRepository,
  InMemoryNotificationQueue,
  InMemoryNotificationRepository,
  InMemoryProviderRepository,
  InMemoryRateLimiter,
  ListNotifications,
  SequentialIds,
  type AuditEntry,
} from '@notifyhub/application';
import type { ClientBase } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgAuditLogRepository } from '../../../packages/persistence/src/pg-audit-log-repository';
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
  let capacity: InMemoryDispatchCapacityRepository;

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
      ...providerAndAuditDeps(providers, audit, capacity),
    };
    app = createApp(async () => ({ deps }));
  };

  beforeEach(() => {
    providers = new InMemoryProviderRepository();
    audit = new InMemoryAuditLogRepository();
    capacity = new InMemoryDispatchCapacityRepository();
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

  describe('detalle recuperado de registros históricos', () => {
    it('reconstruye metadatos de solicitud e intento desde las tablas existentes', async () => {
      const base = {
        notification_id: '00000000-0000-4000-8000-000000000001',
        from_status: null,
        to_status: 'RECEIVED',
        channel: 'EMAIL',
        provider_code: null,
        detail: null,
        occurred_at: new Date('2026-10-12T15:00:00Z'),
        notification_priority: 'HIGH',
        preferred_channel: 'EMAIL',
        idempotency_key_provided: true,
        sender_has_name: true,
        sender_has_email: false,
        sender_has_phone: false,
        recipient_has_email: true,
        recipient_has_phone: false,
        recipient_has_device_token: false,
        recipient_has_webhook_url: false,
        message_has_subject: true,
        message_body_length: 25,
        message_data: { customField: 'valor' },
        attempt_number: null,
        attempt_status: null,
        attempt_is_fallback: null,
        attempt_error_code: null,
        attempt_latency_ms: null,
        attempt_provider_message_id: null,
      };
      const rows = [
        { ...base, id: '1', event_type: 'notification.received' },
        {
          ...base,
          id: '2',
          event_type: 'delivery.attempt',
          from_status: 'SENDING',
          to_status: 'SENDING',
          provider_code: 'sendgrid',
          attempt_number: 1,
          attempt_status: 'FAILED',
          attempt_is_fallback: false,
          attempt_error_code: '503 UNAVAILABLE',
          attempt_latency_ms: 1800,
        },
      ];
      const db = { query: vi.fn().mockResolvedValue({ rows }) } as unknown as ClientBase;
      const page = await new PgAuditLogRepository(db).list('app-admin', {}, { limit: 20 });

      expect(page.items.find((item) => item.eventType === 'notification.received')?.detail).toMatchObject({
        priority: 'HIGH',
        preferredChannel: 'EMAIL',
        recipientFields: ['email'],
        message: { hasSubject: true, bodyLength: 25, dataFieldCount: 1 },
      });
      expect(page.items.find((item) => item.eventType === 'delivery.attempt')?.detail).toMatchObject({
        attemptNumber: 1,
        status: 'FAILED',
        isFallback: false,
        errorCode: '503 UNAVAILABLE',
        latencyMs: 1800,
      });
    });
  });

  describe('GET /v1/dispatch/capacity', () => {
    it('informa límites y conteos globales sin exponer IDs de otros clientes', async () => {
      capacity.setStatus({
        provider: 'sendgrid',
        limit: 3,
        activeCount: 1,
        waitingCount: 1,
      });

      const res = await call('/v1/dispatch/capacity');
      const body = (await res.json()) as {
        observedAt: string;
        providers: {
          provider: string;
          limit: number;
          activeCount: number;
          waitingCount: number;
        }[];
      };
      const sendgrid = body.providers.find((provider) => provider.provider === 'sendgrid')!;

      expect(res.status).toBe(200);
      expect(body.observedAt).toMatch(/Z$/);
      expect(body.providers.map((provider) => provider.provider)).toEqual([
        'fcm',
        'sendgrid',
        'twilio',
        'webhook',
      ]);
      expect(sendgrid).toMatchObject({
        limit: 3,
        activeCount: 1,
        waitingCount: 1,
      });
      expect(sendgrid).not.toHaveProperty('active');
      expect(sendgrid).not.toHaveProperty('waiting');
      expect((await call('/v1/dispatch/capacity', null)).status).toBe(401);
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
      items: { id: string; eventType: string; detail?: Record<string, unknown> | null }[];
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

    it('incluye los metadatos técnicos del evento en la respuesta', async () => {
      audit.add(
        'app-admin',
        entry(8, {
          eventType: 'delivery.attempt',
          channel: 'EMAIL',
          providerCode: 'sendgrid',
          detail: {
            attemptNumber: 2,
            status: 'RETRYING',
            errorCode: '503 UNAVAILABLE',
            latencyMs: 1800,
            response: { requestId: 'req-123' },
          },
        }),
      );

      const { page } = await get('?notificationId=00000000-0000-4000-8000-000000000001');
      expect(page.items.find((item) => item.id === '8')?.detail).toEqual({
        attemptNumber: 2,
        status: 'RETRYING',
        errorCode: '503 UNAVAILABLE',
        latencyMs: 1800,
        response: { requestId: 'req-123' },
      });
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
