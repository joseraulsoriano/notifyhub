import type { NotificationRequest, NotificationStatus, Priority } from '@notifyhub/domain';
import { assertTransition } from '@notifyhub/domain';
import type {
  ClientApp,
  ClientAppRepository,
  Clock,
  CreateResult,
  IdGenerator,
  NotificationDetail,
  NotificationQueue,
  NotificationRepository,
  RateLimiter,
  RateLimitResult,
  StatusHistoryEntry,
} from '../ports';

/** Implementaciones en memoria de los puertos, para pruebas sin Postgres ni Redis. */
export class InMemoryNotificationRepository implements NotificationRepository {
  readonly items = new Map<string, NotificationRequest>();
  readonly history = new Map<string, StatusHistoryEntry[]>();

  async findByIdempotencyKey(clientAppId: string, key: string) {
    return (
      [...this.items.values()].find((n) => n.clientAppId === clientAppId && n.idempotencyKey === key) ?? null
    );
  }

  async createReceived(notification: NotificationRequest): Promise<CreateResult> {
    if (notification.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(notification.clientAppId, notification.idempotencyKey);
      if (existing) return { created: false, existing };
    }
    this.items.set(notification.id, { ...notification });
    this.history.set(notification.id, [{ from: null, to: 'RECEIVED', occurredAt: notification.createdAt }]);
    return { created: true, notification };
  }

  async transition(id: string, from: NotificationStatus, to: NotificationStatus) {
    const item = this.items.get(id);
    if (!item || item.status !== from) throw new Error(`La notificación ${id} no está en ${from}`);
    assertTransition(from, to);
    item.status = to;
    this.history.get(id)?.push({ from, to, occurredAt: new Date() });
  }

  async releaseIdempotencyKey(id: string) {
    const item = this.items.get(id);
    if (item) item.idempotencyKey = null;
  }

  async findDetail(id: string, clientAppId: string): Promise<NotificationDetail | null> {
    const notification = this.items.get(id);
    if (!notification || notification.clientAppId !== clientAppId) return null;
    return { notification, attempts: [], history: this.history.get(id) ?? [] };
  }
}

export class InMemoryNotificationQueue implements NotificationQueue {
  readonly jobs: { notificationId: string; priority: Priority }[] = [];
  failNext = false;

  async enqueue(notificationId: string, priority: Priority) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('cola no disponible');
    }
    this.jobs.push({ notificationId, priority });
  }
}

export class InMemoryClientAppRepository implements ClientAppRepository {
  constructor(private readonly apps: Map<string, ClientApp> = new Map()) {}

  add(apiKeyHash: string, app: ClientApp) {
    this.apps.set(apiKeyHash, app);
  }

  async findByApiKeyHash(apiKeyHash: string) {
    return this.apps.get(apiKeyHash) ?? null;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, number>();

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const count = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, count);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: windowSeconds,
    };
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date = new Date('2026-10-12T15:00:00Z')) {}

  now() {
    return this.current;
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;

  next() {
    this.n += 1;
    return `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`;
  }
}
