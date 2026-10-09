import type {
  AcceptNotification,
  ClientApp,
  ClientAppRepository,
  GetNotificationStatus,
  RateLimiter,
} from '@notifyhub/application';
import { hashApiKey } from '@notifyhub/application';
import type { AppConfig } from '@notifyhub/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { detail, summary } from './http/presenters';
import { httpProblem, toProblem } from './http/problem';
import { CreateNotificationSchema, IdempotencyKeySchema, NotificationIdSchema } from './http/schemas';

/** Lo que necesita la capa HTTP. Los casos de uso no conocen Hono ni Cloudflare. */
export interface ApiDeps {
  config: Pick<AppConfig, 'RATE_LIMIT_WINDOW_SECONDS'>;
  clients: ClientAppRepository;
  limiter: RateLimiter;
  accept: AcceptNotification;
  getStatus: GetNotificationStatus;
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

  /** NH-18: estado actual e historial de intentos. */
  v1.get('/notifications/:id', async (c) => {
    const id = NotificationIdSchema.parse(c.req.param('id'));
    return c.json(detail(await c.var.deps.getStatus.execute(id, c.var.clientApp.id)));
  });

  app.route('/v1', v1);
  return app;
}
