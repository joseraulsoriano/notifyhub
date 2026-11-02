import {
  NotifyHubError,
  type AuditEntry,
  type Channel,
  type CreateNotificationInput,
  type CreateSubscriptionInput,
  type CreatedSubscription,
  type DeliveryAttempt,
  type DispatchCapacitySnapshot,
  type ListAuditLogQuery,
  type ListNotificationsQuery,
  type NotificationDetail,
  type NotificationListItem,
  type NotificationStatus,
  type NotificationSubscription,
  type NotifyHubClient,
  type Page,
  type Priority,
  type Provider,
  type ProviderHealth,
} from '@notifyhub/client';

/**
 * Cliente de demostración: se comporta como la API pero en memoria, sin servidor. Cada notificación se
 * "planea" completa al crearla (reintentos, backoff, fallback y entrega, con la misma lógica que el
 * despachador) y se va revelando con el paso del tiempo, así que el sondeo de la UI la ve avanzar.
 */

const CHAINS: Record<Channel, Channel[]> = {
  EMAIL: ['SMS', 'PUSH'],
  SMS: ['PUSH', 'EMAIL'],
  PUSH: ['SMS', 'EMAIL'],
  WEBHOOK: ['EMAIL'],
};
const PROVIDER: Record<Channel, string> = {
  EMAIL: 'sendgrid',
  SMS: 'twilio',
  PUSH: 'fcm',
  WEBHOOK: 'webhook',
};
const LATENCY: Record<string, [number, number]> = {
  sendgrid: [180, 260],
  twilio: [260, 340],
  fcm: [90, 160],
  webhook: [80, 130],
};
const REVEAL_MS = 650;
const MAX_ATTEMPTS = 3;

type Behavior = 'ok' | 'transient' | 'permanent';
type StepBody =
  | { kind: 'status'; from: NotificationStatus | null; to: NotificationStatus }
  | { kind: 'attempt'; attempt: Omit<DeliveryAttempt, 'attemptedAt'> };
type Step = { t: number; reveal: number } & StepBody;

interface Contact {
  email?: string;
  phone?: string;
  deviceToken?: string;
  webhookUrl?: string;
}
interface Record_ {
  id: string;
  createdMs: number;
  revealStartMs: number;
  priority: Priority;
  preferred: Channel;
  subject: string | null;
  body: string;
  contact: Contact;
  key: string | null;
  steps: Step[];
}

const available = (c: Contact): Channel[] =>
  (['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'] as const).filter((ch) =>
    Boolean(
      c[{ EMAIL: 'email', SMS: 'phone', PUSH: 'deviceToken', WEBHOOK: 'webhookUrl' }[ch] as keyof Contact],
    ),
  );

/** Misma secuencia que el despachador: reintentos con backoff, FALLBACK al siguiente canal y entrega. */
function plan(o: {
  preferred: Channel;
  contact: Contact;
  behavior: (provider: string) => Behavior;
  rng: () => number;
}): Step[] {
  const steps: Step[] = [];
  let t = 0;
  // La API recibe y encola en la misma petición: RECEIVED y QUEUED se ven al instante; el resto, paso a paso.
  const push = (step: StepBody) =>
    steps.push({ ...step, t, reveal: Math.max(0, steps.length - 1) * REVEAL_MS });
  const between = (a: number, b: number) => Math.round(a + o.rng() * (b - a));
  const status = (from: NotificationStatus | null, to: NotificationStatus, dt = 5) => {
    t += dt;
    push({ kind: 'status', from, to });
  };

  status(null, 'RECEIVED', 0);
  status('RECEIVED', 'QUEUED', 12);
  status('QUEUED', 'SENDING', 290);
  const have = available(o.contact);
  const channels = [o.preferred, ...CHAINS[o.preferred]].filter(
    (c, i, all) => all.indexOf(c) === i && (c === o.preferred || have.includes(c)),
  );
  let attemptNumber = 0;

  for (const [ci, channel] of channels.entries()) {
    const provider = PROVIDER[channel];
    for (let retry = 1; retry <= MAX_ATTEMPTS; retry++) {
      attemptNumber += 1;
      const behavior = o.behavior(provider);
      const [min, max] = LATENCY[provider]!;
      const latencyMs =
        behavior === 'ok'
          ? between(min, max)
          : behavior === 'transient'
            ? between(1600, 2000)
            : between(300, 700);
      t += latencyMs;
      const exhausted = behavior === 'permanent' || retry === MAX_ATTEMPTS;
      const failed = behavior !== 'ok';
      push({
        kind: 'attempt',
        attempt: {
          attemptNumber,
          provider,
          channel,
          status: !failed ? 'SENT' : exhausted ? 'FAILED' : 'RETRYING',
          isFallback: ci > 0,
          providerMessageId: failed ? null : `${provider}-${Math.floor(o.rng() * 1e6)}`,
          errorCode: !failed
            ? null
            : behavior === 'permanent'
              ? channel === 'EMAIL'
                ? '550 MAILBOX_NOT_FOUND'
                : '404 UNREGISTERED'
              : '503 UNAVAILABLE',
          latencyMs,
        },
      });
      if (!failed) {
        status('SENDING', 'SENT', 10);
        if (channel !== 'WEBHOOK') status('SENT', 'DELIVERED', 10);
        return steps;
      }
      if (exhausted) break;
      status('SENDING', 'RETRYING');
      t += 500 * 2 ** (retry - 1);
      status('RETRYING', 'SENDING', 0);
    }
    status('SENDING', 'FALLBACK');
    if (ci < channels.length - 1) status('FALLBACK', 'SENDING', 100);
    else {
      status('FALLBACK', 'FAILED', 100);
      return steps;
    }
  }
  return steps;
}

const mask = (c: Contact, ch: Channel): string => {
  switch (ch) {
    case 'EMAIL': {
      const [local = '', domain = ''] = (c.email ?? '').split('@');
      return local ? `${local[0]}***@${domain}` : '';
    }
    case 'SMS': {
      const d = (c.phone ?? '').replace(/\D/g, '');
      return d.length >= 6 ? `+${d.slice(0, 2)} ****-${d.slice(-4)}` : '';
    }
    case 'PUSH': {
      const t = c.deviceToken ?? '';
      return t.length >= 8 ? `${t.slice(0, 4)}••••${t.slice(-4)}` : '';
    }
    case 'WEBHOOK': {
      try {
        return `${new URL(c.webhookUrl ?? '').origin}/…`;
      } catch {
        return '';
      }
    }
  }
};

const PRIORITY: Record<string, Priority> = {
  alta: 'HIGH',
  media: 'MEDIUM',
  baja: 'LOW',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

/** Estado visible de una notificación en un instante: solo los pasos ya revelados. */
function materialize(rec: Record_, now: number): { item: NotificationListItem; detail: NotificationDetail } {
  const shown = rec.steps.filter((s) => rec.revealStartMs + s.reveal <= now);
  const iso = (t: number) => new Date(rec.createdMs + t).toISOString();
  const statuses = shown.filter((s): s is Extract<Step, { kind: 'status' }> => s.kind === 'status');
  const attempts: DeliveryAttempt[] = shown
    .filter((s): s is Extract<Step, { kind: 'attempt' }> => s.kind === 'attempt')
    .map((s) => ({ ...s.attempt, attemptedAt: iso(s.t) }));
  const status = statuses.at(-1)?.to ?? 'RECEIVED';
  const last = shown.at(-1);
  const base = {
    id: rec.id,
    status,
    priority: rec.priority,
    preferredChannel: rec.preferred,
    createdAt: new Date(rec.createdMs).toISOString(),
    links: { self: `/v1/notifications/${rec.id}` },
  };
  const updatedAt = iso(last?.t ?? 0);
  return {
    item: {
      ...base,
      updatedAt,
      subject: rec.subject,
      preview: rec.body.length > 140 ? `${rec.body.slice(0, 139)}…` : rec.body,
      recipient: mask(rec.contact, rec.preferred),
      idempotencyKey: rec.key,
      attemptCount: attempts.length,
      usedFallback: attempts.some((a) => a.isFallback),
      finalChannel: attempts.at(-1)?.channel ?? null,
      totalLatencyMs: attempts.reduce((sum, a) => sum + (a.latencyMs ?? 0), 0),
    },
    detail: {
      ...base,
      updatedAt,
      attempts,
      history: statuses.map((s) => ({ from: s.from, to: s.to, at: iso(s.t) })),
    },
  };
}

export interface DemoOptions {
  /** Reloj; para pruebas. */
  now?: () => number;
  /** Donde guardar lo creado y la salud de los proveedores, para que sobreviva a cambiar de página. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const STORAGE_KEY = 'notifyhub:demo';

/** Crea el cliente de demostración. Las notificaciones se agregan al enviarlas. */
export function createDemoClient(options: DemoOptions = {}): NotifyHubClient {
  const clock = options.now ?? Date.now;
  const records = new Map<string, Record_>();
  const providers: Provider[] = [
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
  const subscriptions = new Map<string, NotificationSubscription>();

  const storage = options.storage;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as {
      records: Record_[];
      providers: Provider[];
      subscriptions?: NotificationSubscription[];
    } | null;
    if (saved) {
      for (const r of saved.records) records.set(r.id, r);
      for (const p of saved.providers) Object.assign(providers.find((x) => x.code === p.code) ?? {}, p);
      for (const subscription of saved.subscriptions ?? []) subscriptions.set(subscription.id, subscription);
    }
  } catch {
    // datos guardados dañados: se ignoran
  }
  const persist = () => {
    try {
      storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          records: [...records.values()],
          providers,
          subscriptions: [...subscriptions.values()],
        }),
      );
    } catch {
      // sin almacenamiento disponible
    }
  };

  const view = (r: Record_) => materialize(r, clock());
  const sorted = () =>
    [...records.values()].sort((a, b) => b.createdMs - a.createdMs || (a.id < b.id ? 1 : -1));

  const entries = (): AuditEntry[] => {
    const out: AuditEntry[] = [];
    for (const r of records.values()) {
      const { detail } = view(r);
      for (const h of detail.history) {
        out.push({
          id: '',
          notificationId: r.id,
          eventType: h.from === null ? 'notification.received' : 'notification.status_changed',
          fromStatus: h.from,
          toStatus: h.to,
          channel: h.from === null ? r.preferred : null,
          providerCode: null,
          detail: null,
          occurredAt: h.at,
        });
      }
      for (const a of detail.attempts) {
        out.push({
          id: '',
          notificationId: r.id,
          eventType: 'delivery.attempt',
          fromStatus: 'SENDING',
          toStatus: 'SENDING',
          channel: a.channel,
          providerCode: a.provider,
          detail: {
            attemptNumber: a.attemptNumber,
            status: a.status,
            isFallback: a.isFallback,
            errorCode: a.errorCode,
            latencyMs: a.latencyMs,
          },
          occurredAt: a.attemptedAt,
        });
      }
    }
    return out
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((e, i) => ({ ...e, id: String(10_000 - i) }));
  };

  const page = <T>(all: T[], limit = 50, cursor?: string): Page<T> => {
    const from = cursor ? Number(cursor) : 0;
    const slice = all.slice(from, from + limit);
    return { items: slice, nextCursor: from + limit < all.length ? String(from + limit) : null };
  };

  return {
    async health() {
      return { status: 'ok' };
    },
    dispatch: {
      async capacity(): Promise<DispatchCapacitySnapshot> {
        return {
          observedAt: new Date(clock()).toISOString(),
          providers: [
            { provider: 'sendgrid', limit: 3, activeCount: 0, waitingCount: 0 },
            { provider: 'twilio', limit: 2, activeCount: 0, waitingCount: 0 },
            { provider: 'fcm', limit: 5, activeCount: 0, waitingCount: 0 },
            { provider: 'webhook', limit: 2, activeCount: 0, waitingCount: 0 },
          ],
        };
      },
    },
    notifications: {
      async create(input: CreateNotificationInput, opts = {}) {
        const key = opts.idempotencyKey ?? null;
        const previous = key ? [...records.values()].find((r) => r.key === key) : undefined;
        if (previous) return { ...view(previous).detail, replayed: true };

        const contact: Contact = input.recipient;
        const id = crypto.randomUUID();
        const rng = Math.random;
        const health = new Map(providers.map((p) => [p.code, p]));
        const steps = plan({
          preferred: input.preferredChannel,
          contact,
          rng,
          behavior: (code) => {
            const p = health.get(code);
            if (!p || !p.enabled || p.health === 'DOWN') return 'transient';
            return p.health === 'DEGRADED' && rng() < 0.5 ? 'transient' : 'ok';
          },
        });
        const rec: Record_ = {
          id,
          createdMs: clock(),
          revealStartMs: clock(),
          priority: PRIORITY[input.priority] ?? 'MEDIUM',
          preferred: input.preferredChannel,
          subject: input.message.subject ?? null,
          body: input.message.body,
          contact,
          key,
          steps,
        };
        records.set(id, rec);
        persist();
        // La API responde 202 con la notificación recién encolada.
        const { detail } = materialize({ ...rec, steps: steps.slice(0, 2) }, clock() + 1_000_000);
        return {
          id,
          status: 'QUEUED',
          priority: rec.priority,
          preferredChannel: rec.preferred,
          createdAt: detail.createdAt,
          links: detail.links,
          replayed: false,
        };
      },
      async get(id) {
        const r = records.get(id);
        if (!r)
          throw new NotifyHubError({ status: 404, title: 'NOT_FOUND', detail: 'No existe la notificación' });
        return view(r).detail;
      },
      async list(query: ListNotificationsQuery = {}) {
        const q = query.q?.toLowerCase();
        const items = sorted()
          .map((r) => view(r).item)
          .filter((i) => !query.status || i.status === query.status)
          .filter((i) => !query.channel || i.preferredChannel === query.channel)
          .filter((i) => !query.priority || i.priority === query.priority)
          .filter(
            (i) =>
              !q ||
              [i.subject ?? '', i.preview, i.id, i.idempotencyKey ?? ''].some((t) =>
                t.toLowerCase().includes(q),
              ),
          );
        return page(items, query.limit, query.cursor);
      },
    },
    providers: {
      async list() {
        return providers.map((p) => ({ ...p }));
      },
      async update(code: string, patch: { health?: ProviderHealth; enabled?: boolean }) {
        const p = providers.find((x) => x.code === code);
        if (!p)
          throw new NotifyHubError({ status: 404, title: 'NOT_FOUND', detail: 'No existe el proveedor' });
        Object.assign(p, patch);
        persist();
        return { ...p };
      },
    },
    subscriptions: {
      async list() {
        return [...subscriptions.values()].map((subscription) => ({
          ...subscription,
          eventTypes: [...subscription.eventTypes],
        }));
      },
      async create(input: CreateSubscriptionInput): Promise<CreatedSubscription> {
        const subscription: NotificationSubscription = {
          id: crypto.randomUUID(),
          subscriberName: input.subscriberName,
          targetUrl: input.targetUrl,
          eventTypes: [...input.eventTypes],
          active: true,
        };
        subscriptions.set(subscription.id, subscription);
        persist();
        return { ...subscription, signingSecret: `demo_${crypto.randomUUID()}` };
      },
      async setActive(id: string, active: boolean) {
        const subscription = subscriptions.get(id);
        if (!subscription)
          throw new NotifyHubError({ status: 404, title: 'NOT_FOUND', detail: 'No existe la suscripción' });
        subscription.active = active;
        persist();
        return { ...subscription, eventTypes: [...subscription.eventTypes] };
      },
    },
    auditLog: {
      async list(query: ListAuditLogQuery = {}) {
        const all = entries()
          .filter((e) => !query.notificationId || e.notificationId === query.notificationId)
          .filter((e) => !query.eventType || e.eventType === query.eventType)
          .filter((e) => !query.channel || e.channel === query.channel)
          .filter((e) => !query.provider || e.providerCode === query.provider)
          .filter((e) => !query.status || e.detail?.status === query.status);
        return page(all, query.limit, query.cursor);
      },
    },
  };
}
