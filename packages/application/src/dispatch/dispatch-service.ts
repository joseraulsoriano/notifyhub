import type { NotificationRequest, NotificationStatus, Provider } from '@notifyhub/domain';
import type { Clock, NotificationRepository, ProviderRepository } from '../ports';
import type { EventPublisher } from './event-publisher';
import type { FallbackPolicy } from './fallback-policy';
import type { NotificationSender } from './notification-sender';
import { backoffMs, type RetryConfig } from './retry-policy';
import type { SenderRegistry } from './sender-creator';
import type { StrategyByPriority } from './strategies';

export interface DispatchDeps {
  notifications: NotificationRepository;
  providers: ProviderRepository;
  registry: SenderRegistry;
  fallback: FallbackPolicy;
  strategyFor: StrategyByPriority;
  retry: RetryConfig;
  publisher: EventPublisher;
  clock: Clock;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface DispatchOutcome {
  /** `skipped`: otra entrega ya la tomó o no está en cola; `not_found`: la notificación no existe. */
  result: 'delivered' | 'sent' | 'failed' | 'skipped' | 'not_found';
  attempts: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * RF2 y RF3: toma una notificación encolada, pide a la Strategy el orden de proveedores de cada canal,
 * obtiene el emisor de la factoría, reintenta con backoff y, si se agotan, pasa al siguiente canal (fallback).
 * Cada cambio de estado respeta la máquina de estados del dominio y se publica como evento (Observer).
 */
export class DispatchService {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly deps: DispatchDeps) {
    this.sleep = deps.sleep ?? realSleep;
    this.random = deps.random ?? Math.random;
  }

  async dispatch(notificationId: string): Promise<DispatchOutcome> {
    const { notifications } = this.deps;
    const notification = await notifications.findById(notificationId);
    if (!notification) return { result: 'not_found', attempts: 0 };
    // Queues entrega al menos una vez: si ya no está en cola, otra entrega la procesó.
    if (notification.status !== 'QUEUED') return { result: 'skipped', attempts: 0 };

    // Objeto (no variable suelta) para que el estado actual se vea desde las funciones internas.
    const track: { state: NotificationStatus } = { state: 'QUEUED' };
    const move = async (to: NotificationStatus, detail?: Record<string, unknown>) => {
      await notifications.transition(notification.id, track.state, to);
      await this.deps.publisher.publish({
        type: 'notification.status_changed',
        notificationId: notification.id,
        from: track.state,
        to,
        occurredAt: this.deps.clock.now(),
        ...(detail ? { detail } : {}),
      });
      track.state = to;
    };

    try {
      await move('SENDING');
    } catch {
      return { result: 'skipped', attempts: 0 };
    }

    const providers = (await this.deps.providers.list()).filter((p) => p.enabled);
    const channels = this.deps.fallback.channelsFor(notification.recipient, notification.preferredChannel);
    const strategy = this.deps.strategyFor(notification.priority);
    let attempts = 0;

    for (const [channelIndex, channel] of channels.entries()) {
      const candidates = strategy.rank(
        notification,
        providers.filter((p) => p.channel === channel),
      );
      if (candidates.length === 0) continue;

      for (const [providerIndex, provider] of candidates.entries()) {
        const isFallback = channelIndex > 0 || providerIndex > 0;
        const sender = this.deps.registry.getSender(provider);
        const outcome = await this.tryProvider(
          notification,
          sender,
          provider,
          isFallback,
          attempts,
          move,
          () => track.state,
        );
        attempts = outcome.attempts;
        if (outcome.delivered !== null) {
          return { result: outcome.delivered ? 'delivered' : 'sent', attempts };
        }
      }

      // Se agotó este canal: pasa a FALLBACK y, si hay otro canal, vuelve a SENDING.
      await move('FALLBACK', { exhaustedChannel: channel, strategy: strategy.name });
      const hasNext = channels
        .slice(channelIndex + 1)
        .some((next) => providers.some((p) => p.channel === next));
      if (hasNext) await move('SENDING');
      else {
        await move('FAILED', { reason: 'sin canales alternativos' });
        return { result: 'failed', attempts };
      }
    }

    // Ningún canal tenía proveedor habilitado.
    if (track.state === 'SENDING') await move('FALLBACK', { reason: 'sin proveedores habilitados' });
    await move('FAILED', { reason: 'sin proveedores habilitados' });
    return { result: 'failed', attempts };
  }

  /** Intenta con un proveedor hasta `maxAttempts` veces. `delivered`: true/false si salió, null si se agotó. */
  private async tryProvider(
    notification: NotificationRequest,
    sender: NotificationSender,
    provider: Provider,
    isFallback: boolean,
    attemptsSoFar: number,
    move: (to: NotificationStatus, detail?: Record<string, unknown>) => Promise<void>,
    state: () => NotificationStatus,
  ): Promise<{ attempts: number; delivered: boolean | null }> {
    const { maxAttempts } = this.deps.retry;
    let attempts = attemptsSoFar;

    for (let retry = 1; retry <= maxAttempts; retry++) {
      attempts += 1;
      const result = await sender.send(notification);
      const exhausted = !result.ok && (!result.retryable || retry === maxAttempts);
      const attemptStatus = result.ok ? 'SENT' : exhausted ? 'FAILED' : 'RETRYING';

      const attempt = await this.deps.notifications.recordAttempt({
        notificationId: notification.id,
        providerCode: provider.code,
        channel: provider.channel,
        attemptNumber: attempts,
        isFallback,
        status: attemptStatus,
        providerMessageId: result.ok ? result.providerMessageId : null,
        errorCode: result.ok ? null : result.errorCode,
        latencyMs: result.latencyMs,
        response: result.response ?? null,
      });
      await this.deps.publisher.publish({
        type: 'notification.attempted',
        notificationId: notification.id,
        providerCode: provider.code,
        channel: provider.channel,
        attemptNumber: attempt.attemptNumber,
        isFallback,
        status: attemptStatus,
        errorCode: result.ok ? null : result.errorCode,
        latencyMs: result.latencyMs,
        occurredAt: this.deps.clock.now(),
      });

      if (result.ok) {
        await move('SENT', { provider: provider.code });
        if (result.delivered) {
          await move('DELIVERED', { provider: provider.code });
          return { attempts, delivered: true };
        }
        return { attempts, delivered: false };
      }
      if (exhausted) return { attempts, delivered: null };

      // Error transitorio: espera con backoff exponencial y vuelve a intentar.
      await move('RETRYING', { provider: provider.code, errorCode: result.errorCode, retry });
      await this.sleep(backoffMs(this.deps.retry, retry, this.random));
      if (state() === 'RETRYING') await move('SENDING');
    }
    return { attempts, delivered: null };
  }
}
