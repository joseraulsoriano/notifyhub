import {
  NotifyHubError,
  type AuditEntry,
  type Channel,
  type CreateNotificationInput,
  type DeliveryAttempt,
  type ListAuditLogQuery,
  type ListNotificationsQuery,
  type NotificationDetail,
  type NotificationListItem,
  type NotificationStatus,
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

/** Generador pseudoaleatorio con semilla: los datos de ejemplo salen iguales en cada carga. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

const CONTACT = {
  email: 'ana.lopez@example.com',
  phone: '+5215512345678',
  deviceToken: 'fcm:APA91bHe41a0000',
  webhookUrl: 'https://erp.cliente.mx/hook',
};

interface Seed {
  id: string;
  minutes: number;
  preferred: Channel;
  priority: Priority;
  subject: string;
  body: string;
  contact?: Contact;
  behavior?: Record<string, Behavior>;
  /** Corta la historia en este estado para mostrar notificaciones todavía en curso. */
  stopAt?: NotificationStatus;
  key: string;
}

const SEEDS: Seed[] = [
  {
    id: '7f3a91c2-0000-4000-8000-000000000001',
    minutes: 1,
    preferred: 'EMAIL',
    priority: 'HIGH',
    subject: 'Tu pedido #4821 va en camino',
    body: 'Hola Ana, tu pedido salió del almacén y llegará mañana antes de las 14:00.',
    key: 'pedido-4821-envio',
  },
  {
    id: 'b20e44d1-0000-4000-8000-000000000002',
    minutes: 2,
    preferred: 'SMS',
    priority: 'HIGH',
    subject: 'Código de verificación',
    body: 'Tu código es 482913. Vence en 10 minutos.',
    key: 'otp-93811',
  },
  {
    id: 'c9d40a77-0000-4000-8000-000000000003',
    minutes: 4,
    preferred: 'PUSH',
    priority: 'MEDIUM',
    subject: 'Oferta de octubre: 20% en tu próxima compra',
    body: 'Aprovecha el descuento hasta el domingo en toda la tienda.',
    behavior: { fcm: 'transient' },
    key: 'promo-oct-112',
  },
  {
    id: '1ad8e502-0000-4000-8000-000000000004',
    minutes: 6,
    preferred: 'WEBHOOK',
    priority: 'MEDIUM',
    subject: 'Factura INV-2210 emitida',
    body: 'Evento invoice.created · payload 1.2 KB hacia el ERP.',
    contact: { webhookUrl: CONTACT.webhookUrl, email: CONTACT.email },
    key: 'inv-2210',
  },
  {
    id: 'e84b3f10-0000-4000-8000-000000000005',
    minutes: 7,
    preferred: 'EMAIL',
    priority: 'LOW',
    subject: 'Boletín #41 · Novedades de octubre',
    body: 'Descubre lo nuevo en la plataforma este mes.',
    stopAt: 'QUEUED',
    key: 'newsletter-41',
  },
  {
    id: '05c6b7a9-0000-4000-8000-000000000006',
    minutes: 8,
    preferred: 'SMS',
    priority: 'HIGH',
    subject: 'Alerta de seguridad: inicio de sesión nuevo',
    body: 'Detectamos un acceso desde un dispositivo que no reconocemos.',
    behavior: { twilio: 'transient' },
    stopAt: 'RETRYING',
    key: 'alerta-fraude-77',
  },
  {
    id: '92fe6d3c-0000-4000-8000-000000000007',
    minutes: 12,
    preferred: 'EMAIL',
    priority: 'MEDIUM',
    subject: 'Recibo de pago #8812',
    body: 'Gracias por tu compra. Adjuntamos tu recibo en PDF.',
    contact: { email: 'm.perez@example.com', deviceToken: CONTACT.deviceToken },
    behavior: { sendgrid: 'permanent', fcm: 'permanent' },
    key: 'recibo-8812',
  },
  {
    id: '3b71aa08-0000-4000-8000-000000000008',
    minutes: 13,
    preferred: 'PUSH',
    priority: 'LOW',
    subject: 'Recordatorio: tu cita es en 30 minutos',
    body: 'Te esperamos a las 13:30 en la sucursal Centro.',
    stopAt: 'SENDING',
    key: 'recordatorio-30',
  },
  {
    id: 'd0a25e19-0000-4000-8000-000000000009',
    minutes: 15,
    preferred: 'EMAIL',
    priority: 'MEDIUM',
    subject: 'Bienvenido a NotifyHub',
    body: 'Tu cuenta está lista. Empieza configurando tus canales.',
    key: 'bienvenida-501',
  },
  {
    id: 'a6c32b84-0000-4000-8000-000000000010',
    minutes: 16,
    preferred: 'SMS',
    priority: 'LOW',
    subject: 'Encuesta de satisfacción',
    body: '¿Cómo fue tu experiencia? Responde en menos de un minuto.',
    stopAt: 'RECEIVED',
    key: 'encuesta-90',
  },
  {
    id: 'f1b97c20-0000-4000-8000-000000000011',
    minutes: 1500,
    preferred: 'SMS',
    priority: 'HIGH',
    subject: 'Pago rechazado: actualiza tu tarjeta',
    body: 'No pudimos cobrar tu suscripción. Actualiza tu método de pago.',
    key: 'cobro-rechazado-310',
  },
  {
    id: '8e44d3a1-0000-4000-8000-000000000012',
    minutes: 1530,
    preferred: 'EMAIL',
    priority: 'LOW',
    subject: 'Resumen semanal de actividad',
    body: 'Esta semana enviaste 8,412 notificaciones con 98.1% de entrega.',
    key: 'resumen-semanal-40',
  },
  {
    id: '2c9761fe-0000-4000-8000-000000000013',
    minutes: 1620,
    preferred: 'WEBHOOK',
    priority: 'MEDIUM',
    subject: 'Evento pedido.cancelado',
    body: 'Notificación al sistema de inventario sobre el pedido #4790.',
    contact: { webhookUrl: 'https://inventario.cliente.mx/nh' },
    behavior: { webhook: 'transient' },
    key: 'pedido-4790-cancel',
  },
];

export interface DemoOptions {
  /** Reloj; para pruebas. */
  now?: () => number;
  /** Donde guardar lo creado y la salud de los proveedores, para que sobreviva a cambiar de página. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const STORAGE_KEY = 'notifyhub:demo';

/** Crea el cliente de demostración. Cada llamada empieza con los mismos datos de ejemplo. */
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

  const start = clock();
  for (const [i, s] of SEEDS.entries()) {
    const createdMs = start - s.minutes * 60_000;
    const rng = seeded(i + 1);
    let steps = plan({
      preferred: s.preferred,
      contact: s.contact ?? CONTACT,
      behavior: (p) => s.behavior?.[p] ?? 'ok',
      rng,
    });
    if (s.stopAt) {
      const cut = steps.findIndex((st) => st.kind === 'status' && st.to === s.stopAt);
      steps = steps.slice(0, cut + 1);
    }
    records.set(s.id, {
      id: s.id,
      createdMs,
      revealStartMs: createdMs - 3_600_000,
      priority: s.priority,
      preferred: s.preferred,
      subject: s.subject,
      body: s.body,
      contact: s.contact ?? CONTACT,
      key: s.key,
      steps,
    });
  }

  const seedIds = new Set(records.keys());
  const storage = options.storage;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as {
      records: Record_[];
      providers: Provider[];
    } | null;
    if (saved) {
      for (const r of saved.records) records.set(r.id, r);
      for (const p of saved.providers) Object.assign(providers.find((x) => x.code === p.code) ?? {}, p);
    }
  } catch {
    // datos guardados dañados: se ignoran
  }
  const persist = () => {
    try {
      storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ records: [...records.values()].filter((r) => !seedIds.has(r.id)), providers }),
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
