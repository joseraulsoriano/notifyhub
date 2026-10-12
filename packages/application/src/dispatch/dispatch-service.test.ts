import type { Channel, NotificationRequest, NotificationStatus, Provider } from '@notifyhub/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROVIDERS,
  FixedClock,
  InMemoryNotificationRepository,
  InMemoryProviderRepository,
} from '../testing/in-memory';
import { DispatchService } from './dispatch-service';
import { CountingSubscriber, EventPublisher } from './event-publisher';
import { FallbackPolicy } from './fallback-policy';
import type { DeliveryResult, NotificationSender } from './notification-sender';
import { DEFAULT_ROUTING } from './routing-config';
import { SenderCreator, SenderRegistry } from './sender-creator';
import { strategyFor } from './strategies';

const OK: DeliveryResult = { ok: true, providerMessageId: 'msg-1', latencyMs: 200, delivered: true };
const TRANSIENT: DeliveryResult = {
  ok: false,
  retryable: true,
  errorCode: '503 UNAVAILABLE',
  latencyMs: 1800,
};
const PERMANENT: DeliveryResult = {
  ok: false,
  retryable: false,
  errorCode: '550 MAILBOX_NOT_FOUND',
  latencyMs: 300,
};

/** Emisor con respuestas guionadas por proveedor; la última se repite. */
class ScriptedSender implements NotificationSender {
  calls = 0;
  constructor(
    readonly provider: Provider,
    private readonly script: DeliveryResult[],
  ) {}
  get providerCode() {
    return this.provider.code;
  }
  get channel() {
    return this.provider.channel;
  }
  async send() {
    const result = this.script[Math.min(this.calls, this.script.length - 1)]!;
    this.calls += 1;
    return result;
  }
}

describe('DispatchService', () => {
  let notifications: InMemoryNotificationRepository;
  let providers: InMemoryProviderRepository;
  let publisher: EventPublisher;
  let counts: CountingSubscriber;
  let scripts: Record<string, DeliveryResult[]>;
  let senders: Map<string, ScriptedSender>;
  let sleeps: number[];
  let service: DispatchService;

  const registry = () => {
    const reg = new SenderRegistry();
    for (const p of DEFAULT_PROVIDERS) {
      reg.register(
        p.code,
        new (class extends SenderCreator {
          createSender(provider: Provider) {
            const sender =
              senders.get(provider.code) ?? new ScriptedSender(provider, scripts[provider.code] ?? [OK]);
            senders.set(provider.code, sender);
            return sender;
          }
        })(),
      );
    }
    return reg;
  };

  const build = () => {
    service = new DispatchService({
      notifications,
      providers,
      registry: registry(),
      fallback: new FallbackPolicy(DEFAULT_ROUTING.fallback),
      strategyFor: (priority) =>
        strategyFor(DEFAULT_ROUTING.strategy[priority], DEFAULT_ROUTING.providerOrder),
      retry: { ...DEFAULT_ROUTING.retry, jitter: false },
      publisher,
      clock: new FixedClock(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
  };

  /** Crea una notificación ya en cola con datos de contacto para los cuatro canales. */
  const queued = async (preferredChannel: Channel = 'EMAIL', over: Partial<NotificationRequest> = {}) => {
    const now = new Date('2026-10-12T15:00:00Z');
    const id = `00000000-0000-4000-8000-${String(notifications.items.size + 1).padStart(12, '0')}`;
    await notifications.createReceived({
      id,
      clientAppId: 'app-1',
      idempotencyKey: null,
      requestHash: 'h',
      sender: { name: 'Banco' },
      recipient: {
        email: 'ana@example.com',
        phone: '+5215512345678',
        deviceToken: 'fcm:APA91bHe41a0000',
        webhookUrl: 'https://erp.cliente.mx/hook',
      },
      message: { subject: 'Hola', body: 'Cuerpo' },
      priority: 'HIGH',
      preferredChannel,
      status: 'RECEIVED',
      createdAt: now,
      updatedAt: now,
      ...over,
    });
    await notifications.transition(id, 'RECEIVED', 'QUEUED');
    return id;
  };

  const statuses = (id: string) => notifications.history.get(id)!.map((h) => h.to);
  const attempts = (id: string) => notifications.attempts.get(id) ?? [];

  beforeEach(() => {
    notifications = new InMemoryNotificationRepository();
    providers = new InMemoryProviderRepository();
    publisher = new EventPublisher();
    counts = new CountingSubscriber();
    publisher.subscribe(counts);
    scripts = {};
    senders = new Map();
    sleeps = [];
    build();
  });

  it('entrega al primer intento: QUEUED → SENDING → SENT → DELIVERED', async () => {
    const id = await queued('EMAIL');
    const outcome = await service.dispatch(id);

    expect(outcome).toEqual({ result: 'delivered', attempts: 1 });
    expect(statuses(id)).toEqual(['RECEIVED', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED']);
    expect(attempts(id)).toMatchObject([
      { providerCode: 'sendgrid', status: 'SENT', isFallback: false, attemptNumber: 1 },
    ]);
    expect(sleeps).toEqual([]);
  });

  it('reintenta con backoff exponencial ante errores transitorios y luego entrega', async () => {
    scripts.sendgrid = [TRANSIENT, TRANSIENT, OK];
    const id = await queued('EMAIL');
    const outcome = await service.dispatch(id);

    expect(outcome).toEqual({ result: 'delivered', attempts: 3 });
    expect(attempts(id).map((a) => a.status)).toEqual(['RETRYING', 'RETRYING', 'SENT']);
    expect(statuses(id)).toEqual([
      'RECEIVED',
      'QUEUED',
      'SENDING',
      'RETRYING',
      'SENDING',
      'RETRYING',
      'SENDING',
      'SENT',
      'DELIVERED',
    ]);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('agota los reintentos y pasa al siguiente canal (fallback)', async () => {
    scripts.fcm = [TRANSIENT];
    scripts.twilio = [OK];
    const id = await queued('PUSH');
    const outcome = await service.dispatch(id);

    expect(outcome).toEqual({ result: 'delivered', attempts: 4 });
    expect(attempts(id).map((a) => [a.providerCode, a.status, a.isFallback])).toEqual([
      ['fcm', 'RETRYING', false],
      ['fcm', 'RETRYING', false],
      ['fcm', 'FAILED', false],
      ['twilio', 'SENT', true],
    ]);
    expect(statuses(id)).toContain('FALLBACK');
    expect(statuses(id).at(-1)).toBe('DELIVERED');
    expect(attempts(id).map((a) => a.attemptNumber)).toEqual([1, 2, 3, 4]);
  });

  it('un error permanente no se reintenta y pasa directo al fallback', async () => {
    scripts.sendgrid = [PERMANENT];
    scripts.twilio = [OK];
    const id = await queued('EMAIL');
    await service.dispatch(id);

    expect(attempts(id).map((a) => [a.providerCode, a.status, a.errorCode])).toEqual([
      ['sendgrid', 'FAILED', '550 MAILBOX_NOT_FOUND'],
      ['twilio', 'SENT', null],
    ]);
    expect(sleeps).toEqual([]);
  });

  it('falla si ningún canal logra entregar: …FALLBACK → FAILED', async () => {
    scripts.sendgrid = [TRANSIENT];
    scripts.twilio = [TRANSIENT];
    scripts.fcm = [TRANSIENT];
    const id = await queued('EMAIL');
    const outcome = await service.dispatch(id);

    expect(outcome).toEqual({ result: 'failed', attempts: 9 });
    expect(notifications.items.get(id)!.status).toBe('FAILED');
    expect(statuses(id).slice(-2)).toEqual(['FALLBACK', 'FAILED']);
  });

  it('solo intenta los canales con dato de contacto', async () => {
    scripts.sendgrid = [TRANSIENT];
    const id = await queued('EMAIL', { recipient: { email: 'ana@example.com' } });
    const outcome = await service.dispatch(id);

    expect(outcome.result).toBe('failed');
    expect(new Set(attempts(id).map((a) => a.providerCode))).toEqual(new Set(['sendgrid']));
  });

  it('omite proveedores deshabilitados y usa el siguiente canal', async () => {
    await providers.update('sendgrid', { enabled: false });
    const id = await queued('EMAIL');
    const outcome = await service.dispatch(id);

    expect(outcome.result).toBe('delivered');
    expect(attempts(id).map((a) => a.providerCode)).toEqual(['twilio']);
    expect(attempts(id)[0]!.isFallback).toBe(true);
  });

  it('un webhook queda en SENT porque no confirma la entrega', async () => {
    scripts.webhook = [{ ...OK, delivered: false }];
    const id = await queued('WEBHOOK');
    const outcome = await service.dispatch(id);

    expect(outcome.result).toBe('sent');
    expect(notifications.items.get(id)!.status).toBe('SENT');
  });

  it('ignora la entrega duplicada de la cola (Queues entrega al menos una vez)', async () => {
    const id = await queued('EMAIL');
    await service.dispatch(id);
    const again = await service.dispatch(id);

    expect(again).toEqual({ result: 'skipped', attempts: 0 });
    expect(attempts(id)).toHaveLength(1);
  });

  it('responde not_found si la notificación no existe', async () => {
    expect(await service.dispatch('no-existe')).toEqual({ result: 'not_found', attempts: 0 });
  });

  it('publica cada cambio de estado e intento (Observer) y un suscriptor roto no afecta el envío', async () => {
    publisher.subscribe({
      onEvent() {
        throw new Error('suscriptor roto');
      },
    });
    scripts.sendgrid = [TRANSIENT, OK];
    const id = await queued('EMAIL');
    const outcome = await service.dispatch(id);

    expect(outcome.result).toBe('delivered');
    // SENDING, RETRYING, SENDING, SENT, DELIVERED
    expect(counts.counts.get('notification.status_changed')).toBe(5);
    expect(counts.counts.get('notification.attempted')).toBe(2);
  });

  it('cada transición respeta la máquina de estados (el repositorio la valida)', async () => {
    scripts.fcm = [TRANSIENT];
    const id = await queued('PUSH');
    await expect(service.dispatch(id)).resolves.toBeDefined();
    const seq = statuses(id) as NotificationStatus[];
    expect(seq[0]).toBe('RECEIVED');
    expect(seq).not.toContain('FAILED');
  });
});
