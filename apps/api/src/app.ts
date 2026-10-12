import type {
  AcceptNotification,
  ClientApp,
  ClientAppRepository,
  GetNotificationStatus,
  ListAuditLog,
  ListNotifications,
  ListProviders,
  RateLimiter,
  UpdateProvider,
} from '@notifyhub/application';
import { hashApiKey } from '@notifyhub/application';
import type { AppConfig } from '@notifyhub/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { auditEntry, detail, listItem, providerView, summary } from './http/presenters';
import { httpProblem, toProblem } from './http/problem';
import {
  CreateNotificationSchema,
  IdempotencyKeySchema,
  ListAuditLogQuerySchema,
  ListNotificationsQuerySchema,
  NotificationIdSchema,
  ProviderCodeSchema,
  UpdateProviderSchema,
} from './http/schemas';

/** Lo que necesita la capa HTTP. Los casos de uso no conocen Hono ni Cloudflare. */
export interface ApiDeps {
  config: Pick<AppConfig, 'RATE_LIMIT_WINDOW_SECONDS' | 'PROVIDER_ADMIN_CLIENTS'>;
  clients: ClientAppRepository;
  limiter: RateLimiter;
  accept: AcceptNotification;
  getStatus: GetNotificationStatus;
  list: ListNotifications;
  providers: ListProviders;
  updateProvider: UpdateProvider;
  audit: ListAuditLog;
}

export interface OpenedDeps {
  deps: ApiDeps;
  /** Libera recursos de la petición (la conexión a Postgres) después de responder. */
  close?: () => Promise<void>;
}

type AppEnv<B> = { Bindings: B; Variables: { deps: ApiDeps; clientApp: ClientApp } };

/**
 * Arma la API. `open` trae los adaptadores reales (Hyperdrive, Queues, Durable Objects) o los de memoria
 * en las pruebas; se llama una vez por petición porque en Workers no hay conexiones que sobrevivan.
 */
export function createApp<B extends object = object>(open: (c: Context<AppEnv<B>>) => Promise<OpenedDeps>) {
  const app = new Hono<AppEnv<B>>();

  /**
   * CORS para consolas web (SCRUM-54). `CORS_ALLOWED_ORIGINS` es una lista separada por comas, o `*`.
   * Sin la variable no se envían encabezados CORS y solo funcionan clientes del mismo origen o de servidor.
   */
  app.use(
    '/v1/*',
    cors({
      origin: (origin, c) => {
        const allowed = String(
          (c.env as { CORS_ALLOWED_ORIGINS?: string } | undefined)?.CORS_ALLOWED_ORIGINS ?? '',
        )
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        return allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : '';
      },
      allowHeaders: ['Content-Type', 'X-API-Key', 'Idempotency-Key'],
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      exposeHeaders: [
        'Location',
        'Idempotent-Replayed',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      maxAge: 600,
    }),
  );

  app.onError((error, c) => {
    const problem = toProblem(error);
    return c.json(problem, problem.status, { 'Content-Type': 'application/problem+json' });
  });
  app.notFound((c) => {
    const problem = httpProblem(404, `No existe ${c.req.method} ${c.req.path}`);
    return c.json(problem, 404, { 'Content-Type': 'application/problem+json' });
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const v1 = new Hono<AppEnv<B>>();

  v1.use(async (c, next) => {
    const { deps, close } = await open(c);
    c.set('deps', deps);
    try {
      await next();
    } finally {
      if (close) c.executionCtx.waitUntil(close());
    }
  });

  /** NH-17: el cliente se identifica con X-API-Key; en la base solo se guarda el hash SHA-256. */
  v1.use(async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (!apiKey) throw new HTTPException(401, { message: 'Falta el encabezado X-API-Key' });

    const client = await c.var.deps.clients.findByApiKeyHash(hashApiKey(apiKey));
    if (!client || !client.active) throw new HTTPException(401, { message: 'API key inválida o revocada' });

    c.set('clientApp', client);
    await next();
  });

  /** NH-17: límite por cliente (client_app.rate_limit_per_min). */
  v1.use(async (c, next) => {
    const { clientApp, deps } = c.var;
    const window = deps.config.RATE_LIMIT_WINDOW_SECONDS;
    const result = await deps.limiter.hit(`rl:${clientApp.id}`, clientApp.rateLimitPerMin, window);
    c.header('RateLimit-Limit', String(result.limit));
    c.header('RateLimit-Remaining', String(result.remaining));
    c.header('RateLimit-Reset', String(result.resetSeconds));

    if (!result.allowed) {
      c.header('Retry-After', String(result.resetSeconds));
      throw new HTTPException(429, { message: 'Límite de solicitudes excedido' });
    }
    await next();
  });

  /** RF1 (NH-14, NH-15, NH-16): valida, persiste, encola y responde 202 sin esperar el envío. */
  v1.post('/notifications', async (c) => {
    const idempotencyKey = IdempotencyKeySchema.parse(c.req.header('idempotency-key'));
    const body: unknown = await c.req.json().catch(() => {
      throw new HTTPException(400, { message: 'El cuerpo debe ser JSON válido' });
    });
    const payload = CreateNotificationSchema.parse(body);

    const { notification, replayed } = await c.var.deps.accept.execute({
      clientAppId: c.var.clientApp.id,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...payload,
    });

    c.header('Location', `/v1/notifications/${notification.id}`);
    if (replayed) c.header('Idempotent-Replayed', 'true');
    return c.json(summary(notification), 202);
  });

  /** SCRUM-54: lista paginada con filtros, para la consola. Datos de contacto enmascarados. */
  v1.get('/notifications', async (c) => {
    const { limit, cursor, ...filter } = ListNotificationsQuerySchema.parse(c.req.query());
    const page = await c.var.deps.list.execute({ clientAppId: c.var.clientApp.id, filter, limit, cursor });
    return c.json({ items: page.items.map(listItem), nextCursor: page.nextCursor });
  });

  /** NH-18: estado actual e historial de intentos. */
  v1.get('/notifications/:id', async (c) => {
    const id = NotificationIdSchema.parse(c.req.param('id'));
    return c.json(detail(await c.var.deps.getStatus.execute(id, c.var.clientApp.id)));
  });

  /** SCRUM-55: catálogo de proveedores con su salud, para la consola. */
  v1.get('/providers', async (c) => {
    const items = await c.var.deps.providers.execute();
    return c.json({ items: items.map(providerView) });
  });

  /**
   * SCRUM-55: cambia la salud o el estado de un proveedor. Es global (afecta a todos los clientes), así que solo
   * lo permiten los clientes de `PROVIDER_ADMIN_CLIENTS`; con la variable vacía responde 403.
   */
  v1.patch('/providers/:code', async (c) => {
    const { clientApp, deps } = c.var;
    const admins = deps.config.PROVIDER_ADMIN_CLIENTS.split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    if (!(admins.includes('*') || admins.includes(clientApp.id) || admins.includes(clientApp.name))) {
      throw new HTTPException(403, { message: 'Este cliente no puede modificar proveedores' });
    }
    const code = ProviderCodeSchema.parse(c.req.param('code'));
    const body: unknown = await c.req.json().catch(() => {
      throw new HTTPException(400, { message: 'El cuerpo debe ser JSON válido' });
    });
    const { health, enabled } = UpdateProviderSchema.parse(body);
    const updated = await deps.updateProvider.execute(code, {
      ...(health ? { health } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    });
    return c.json(providerView(updated));
  });

  /** RF4 (SCRUM-55): bitácora de auditoría del cliente, con filtros y paginación por cursor. */
  v1.get('/audit-log', async (c) => {
    const { limit, cursor, ...filter } = ListAuditLogQuerySchema.parse(c.req.query());
    const page = await c.var.deps.audit.execute({ clientAppId: c.var.clientApp.id, filter, limit, cursor });
    return c.json({ items: page.items.map(auditEntry), nextCursor: page.nextCursor });
  });

  app.route('/v1', v1);
  return app;
}
