import {
  AcceptNotification,
  GetNotificationStatus,
  ListAuditLog,
  ListNotifications,
  ListProviders,
  UpdateProvider,
} from '@notifyhub/application';
import {
  PgAuditLogRepository,
  PgClientAppRepository,
  PgNotificationRepository,
  PgProviderRepository,
} from '@notifyhub/persistence';
import { loadConfig } from '@notifyhub/shared';
import { Client } from 'pg';
import { createApp } from './app';
import { QueuesNotificationQueue } from './infra/queues-notification-queue';
import { DurableObjectRateLimiter } from './infra/rate-limiter';

export { RateLimiterObject } from './infra/rate-limiter';

/** Conecta los casos de uso con los servicios de Cloudflare: Hyperdrive → Neon, Queues y Durable Objects. */
export default createApp<Env>(async (c) => {
  const env = c.env;
  // Hyperdrive mantiene el pool; abrir un cliente por petición es lo recomendado y es barato.
  const db = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await db.connect();

  const notifications = new PgNotificationRepository(db);
  const providers = new PgProviderRepository(db);
  const queue = new QueuesNotificationQueue({
    HIGH: env.QUEUE_HIGH,
    MEDIUM: env.QUEUE_MEDIUM,
    LOW: env.QUEUE_LOW,
  });
  const clock = { now: () => new Date() };
  const ids = { next: () => crypto.randomUUID() };

  return {
    deps: {
      config: loadConfig(env),
      clients: new PgClientAppRepository(db),
      limiter: new DurableObjectRateLimiter(env.RATE_LIMITER),
      accept: new AcceptNotification(notifications, queue, clock, ids),
      getStatus: new GetNotificationStatus(notifications),
      list: new ListNotifications(notifications),
      providers: new ListProviders(providers),
      updateProvider: new UpdateProvider(providers),
      audit: new ListAuditLog(new PgAuditLogRepository(db)),
    },
    close: () => db.end(),
  };
});
