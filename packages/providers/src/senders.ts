import type { NotificationRequest } from '@notifyhub/domain';
import { BaseSender, type ProviderResponse } from './base-sender';
import type { SimulatedTransport } from './simulated-transport';
import type { Provider } from '@notifyhub/domain';

const id = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

export class SendGridEmailSender extends BaseSender {
  constructor(
    provider: Provider,
    private readonly transport: SimulatedTransport,
  ) {
    super(provider);
  }

  protected doSend(
    _request: NotificationRequest,
    idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const messageId = idempotencyKey ?? id('sg_');
    return this.transport.call(this.provider, { status: 'accepted' }, messageId, signal);
  }
}

export class TwilioSmsSender extends BaseSender {
  constructor(
    provider: Provider,
    private readonly transport: SimulatedTransport,
  ) {
    super(provider);
  }

  protected doSend(
    _request: NotificationRequest,
    idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const sid = idempotencyKey ?? id('SM');
    return this.transport.call(this.provider, { sid, status: 'queued' }, sid, signal);
  }
}

export class FcmPushSender extends BaseSender {
  constructor(
    provider: Provider,
    private readonly transport: SimulatedTransport,
  ) {
    super(provider);
  }

  protected doSend(
    _request: NotificationRequest,
    idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const messageId = idempotencyKey ?? id('');
    const name = `projects/notifyhub/messages/${messageId}`;
    return this.transport.call(this.provider, { name }, name, signal);
  }
}

export class WebhookSender extends BaseSender {
  protected override readonly confirmsDelivery = false;

  constructor(
    provider: Provider,
    private readonly transport: SimulatedTransport,
  ) {
    super(provider);
  }

  protected doSend(
    _request: NotificationRequest,
    idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    return this.transport.call(
      this.provider,
      { ok: true, signature: 'hmac-sha256' },
      idempotencyKey ?? id('wh_'),
      signal,
    );
  }
}
