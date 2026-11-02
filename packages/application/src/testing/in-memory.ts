import type {
  DeliveryAttempt,
  NotificationRequest,
  NotificationStatus,
  Priority,
  Provider,
} from '@notifyhub/domain';
import { assertTransition } from '@notifyhub/domain';
import type {
  AuditEntry,
  AuditLogFilter,
  AuditLogRepository,
  AuditPage,
  ClientApp,
  ClientAppRepository,
  Clock,
  CreateSubscriptionInput,
  CreateResult,
  AcquireProviderCapacityInput,
  DispatchCapacityRepository,
  IdGenerator,
  ListCursor,
  NotificationDetail,
  NotificationListFilter,
  NotificationPage,
  NotificationQueue,
  NotificationRepository,
  NotificationSubscription,
  ProviderCapacityLease,
  ProviderCapacityStatus,
  ProviderPatch,
  ProviderRepository,
  RateLimiter,
  RateLimitResult,
  RecordAttemptInput,
  StatusHistoryEntry,
  SubscriptionRepository,
} from '../ports';

/** Implementaciones en memoria de los puertos, para pruebas sin Postgres ni Redis. */
export class InMemoryNotificationRepository implements NotificationRepository {
  readonly items = new Map<string, NotificationRequest>();
  readonly history = new Map<string, StatusHistoryEntry[]>();
  readonly attempts = new Map<string, DeliveryAttempt[]>();

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
    item.updatedAt = new Date();
    this.history.get(id)?.push({ from, to, occurredAt: new Date() });
  }

  async findById(id: string) {
    return this.items.get(id) ?? null;
  }

  async reclaimStaleDispatch(
    id: string,
    status: Extract<NotificationStatus, 'SENDING' | 'RETRYING' | 'FALLBACK'>,
    staleAfterMs: number,
  ) {
    const item = this.items.get(id);
    if (!item || item.status !== status || Date.now() - item.updatedAt.getTime() <= staleAfterMs) {
      return false;
    }
    item.updatedAt = new Date();
    return true;
  }

  async countAttempts(id: string) {
    return this.attempts.get(id)?.length ?? 0;
  }

  async recordAttempt(input: RecordAttemptInput): Promise<DeliveryAttempt> {
    const list = this.attempts.get(input.notificationId) ?? [];
    const attempt: DeliveryAttempt = {
      id: `attempt-${input.notificationId}-${list.length + 1}`,
      notificationId: input.notificationId,
      providerCode: input.providerCode,
      channel: input.channel,
      attemptNumber: input.attemptNumber,
      isFallback: input.isFallback,
      status: input.status,
      providerMessageId: input.providerMessageId,
      errorCode: input.errorCode,
      latencyMs: input.latencyMs,
      attemptedAt: new Date(),
    };
    this.attempts.set(input.notificationId, [...list, attempt]);
    return attempt;
  }

  async releaseIdempotencyKey(id: string) {
    const item = this.items.get(id);
    if (item) item.idempotencyKey = null;
  }

  async findDetail(id: string, clientAppId: string): Promise<NotificationDetail | null> {
    const notification = this.items.get(id);
    if (!notification || notification.clientAppId !== clientAppId) return null;
    return { notification, attempts: this.attempts.get(id) ?? [], history: this.history.get(id) ?? [] };
  }

  async list(
    clientAppId: string,
    filter: NotificationListFilter,
    page: { limit: number; cursor?: ListCursor },
  ): Promise<NotificationPage> {
    const q = filter.q?.toLowerCase();
    const sorted = [...this.items.values()]
      .filter((n) => n.clientAppId === clientAppId)
      .filter((n) => !filter.status || n.status === filter.status)
      .filter((n) => !filter.channel || n.preferredChannel === filter.channel)
      .filter((n) => !filter.priority || n.priority === filter.priority)
      .filter(
        (n) =>
          !q ||
          [n.message.subject ?? '', n.message.body, n.id, n.idempotencyKey ?? ''].some((t) =>
            t.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    const { cursor } = page;
    const after = cursor
      ? sorted.filter(
          (n) =>
            n.createdAt.getTime() < cursor.createdAt.getTime() ||
            (n.createdAt.getTime() === cursor.createdAt.getTime() && n.id < cursor.id),
        )
      : sorted;
    const slice = after.slice(0, page.limit);
    const last = slice.at(-1);
    return {
      items: slice.map((notification) => {
        const attempts = this.attempts.get(notification.id) ?? [];
        return {
          notification,
          attemptCount: attempts.length,
          usedFallback: attempts.some((a) => a.isFallback),
          finalChannel: attempts.at(-1)?.channel ?? null,
          totalLatencyMs: attempts.reduce((sum, a) => sum + (a.latencyMs ?? 0), 0),
        };
      }),
      next: after.length > page.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
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

export class InMemoryDispatchCapacityRepository implements DispatchCapacityRepository {
  private readonly dispatchClaims = new Map<string, { leaseId: string; expiresAt: number }>();
  private dispatchLeaseSequence = 0;
  private readonly leases = new Map<
    string,
    { lease: ProviderCapacityLease; notificationId: string; queue: string; since: Date }
  >();
  private readonly statusOverrides = new Map<string, ProviderCapacityStatus>();

  setStatus(status: ProviderCapacityStatus) {
    this.statusOverrides.set(status.provider, status);
  }

  async acquireDispatch(notificationId: string, leaseMs: number) {
    const current = this.dispatchClaims.get(notificationId);
    if (current && current.expiresAt > Date.now()) return null;
    const leaseId = `dispatch-lease-${++this.dispatchLeaseSequence}`;
    this.dispatchClaims.set(notificationId, { leaseId, expiresAt: Date.now() + leaseMs });
    return leaseId;
  }

  async renewDispatch(leaseId: string, leaseMs: number) {
    for (const claim of this.dispatchClaims.values()) {
      if (claim.leaseId === leaseId && claim.expiresAt > Date.now()) {
        claim.expiresAt = Date.now() + leaseMs;
        return true;
      }
    }
    return false;
  }

  async releaseDispatch(leaseId: string) {
    for (const [notificationId, claim] of this.dispatchClaims) {
      if (claim.leaseId === leaseId) this.dispatchClaims.delete(notificationId);
    }
  }

  async acquire(input: AcquireProviderCapacityInput): Promise<ProviderCapacityLease> {
    const activeCount = [...this.leases.values()].filter(
      (item) => item.lease.providerCode === input.providerCode,
    ).length;
    if (activeCount >= input.limit) {
      input.onWaiting?.({ activeCount, waitingCount: 1, limit: input.limit });
    }
    const lease = {
      id: `lease-${this.leases.size + 1}`,
      providerCode: input.providerCode,
      activeCount: activeCount + 1,
      limit: input.limit,
    };
    this.leases.set(lease.id, {
      lease,
      notificationId: input.notificationId,
      queue: input.queue,
      since: new Date(),
    });
    return lease;
  }

  async release(leaseId: string) {
    this.leases.delete(leaseId);
  }

  async list(providerLimits: Record<string, number>) {
    const providers: ProviderCapacityStatus[] = Object.entries(providerLimits)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, limit]) => {
        const active = [...this.leases.values()]
          .filter((item) => item.lease.providerCode === provider)
          .map(({ notificationId, queue, since }) => ({ notificationId, queue, since }));
        return (
          this.statusOverrides.get(provider) ?? {
            provider,
            limit,
            activeCount: active.length,
            waitingCount: 0,
          }
        );
      });
    return { observedAt: new Date(), providers };
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

/** Catálogo de proveedores en memoria con los mismos valores que `config/routing.yaml` y el seed. */
export class InMemoryProviderRepository implements ProviderRepository {
  private readonly providers: Map<string, Provider>;

  constructor(initial: Provider[] = DEFAULT_PROVIDERS) {
    this.providers = new Map(initial.map((p) => [p.code, { ...p }]));
  }

  async list() {
    return [...this.providers.values()].map((p) => ({ ...p }));
  }

  async update(code: string, patch: ProviderPatch) {
    const current = this.providers.get(code);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.providers.set(code, next);
    return { ...next };
  }
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly subscriptions = new Map<string, NotificationSubscription & { clientAppId: string }>();

  async list(clientAppId: string) {
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.clientAppId === clientAppId)
      .map(toPublicSubscription);
  }

  async create(input: CreateSubscriptionInput) {
    const subscription = {
      id: input.id,
      clientAppId: input.clientAppId,
      subscriberName: input.subscriberName,
      targetUrl: input.targetUrl,
      eventTypes: [...input.eventTypes],
      active: true,
    };
    this.subscriptions.set(subscription.id, subscription);
    return toPublicSubscription(subscription);
  }

  async setActive(clientAppId: string, id: string, active: boolean) {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.clientAppId !== clientAppId) return null;
    subscription.active = active;
    return toPublicSubscription(subscription);
  }
}

function toPublicSubscription(
  subscription: NotificationSubscription & { clientAppId: string },
): NotificationSubscription {
  return {
    id: subscription.id,
    subscriberName: subscription.subscriberName,
    targetUrl: subscription.targetUrl,
    eventTypes: [...subscription.eventTypes],
    active: subscription.active,
  };
}

export const DEFAULT_PROVIDERS: Provider[] = [
  {
    code: 'sendgrid',
    channel: 'EMAIL',
    costPerMessage: 0.0008,
    reliabilityScore: 95,
    health: 'UP',
    enabled: true,
  },
  {
    code: 'twilio',
    channel: 'SMS',
    costPerMessage: 0.0079,
    reliabilityScore: 97,
    health: 'UP',
    enabled: true,
  },
  { code: 'fcm', channel: 'PUSH', costPerMessage: 0, reliabilityScore: 92, health: 'UP', enabled: true },
  {
    code: 'webhook',
    channel: 'WEBHOOK',
    costPerMessage: 0,
    reliabilityScore: 90,
    health: 'UP',
    enabled: true,
  },
];

/** Bitácora en memoria para pruebas: se llena con `add` y se filtra como la de Postgres. */
export class InMemoryAuditLogRepository implements AuditLogRepository {
  /** Entradas con el cliente dueño de la notificación. */
  private readonly entries: { clientAppId: string; entry: AuditEntry }[] = [];

  add(clientAppId: string, entry: AuditEntry) {
    this.entries.push({ clientAppId, entry });
  }

  async list(
    clientAppId: string,
    filter: AuditLogFilter,
    page: { limit: number; cursor?: ListCursor },
  ): Promise<AuditPage> {
    const { cursor } = page;
    const sorted = this.entries
      .filter((e) => e.clientAppId === clientAppId)
      .map((e) => e.entry)
      .filter((e) => !filter.notificationId || e.notificationId === filter.notificationId)
      .filter((e) => !filter.eventType || e.eventType === filter.eventType)
      .filter((e) => !filter.channel || e.channel === filter.channel)
      .filter((e) => !filter.provider || e.providerCode === filter.provider)
      .filter((e) => !filter.status || e.detail?.status === filter.status)
      .filter((e) => !filter.from || e.occurredAt >= filter.from)
      .filter((e) => !filter.to || e.occurredAt <= filter.to)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || Number(b.id) - Number(a.id));
    const after = cursor
      ? sorted.filter(
          (e) =>
            e.occurredAt.getTime() < cursor.createdAt.getTime() ||
            (e.occurredAt.getTime() === cursor.createdAt.getTime() && Number(e.id) < Number(cursor.id)),
        )
      : sorted;
    const slice = after.slice(0, page.limit);
    const last = slice.at(-1);
    return {
      items: slice,
      next: after.length > page.limit && last ? { createdAt: last.occurredAt, id: last.id } : null,
    };
  }
}
