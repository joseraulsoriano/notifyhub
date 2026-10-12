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

  protected doSend(_request: NotificationRequest): Promise<ProviderResponse> {
    const messageId = id('sg_');
    return this.transport.call(this.provider, { status: 'accepted' }, messageId);
  }
}

export class TwilioSmsSender extends BaseSender {
  constructor(
    provider: Provider,
    private readonly transport: SimulatedTransport,
  ) {
    super(provider);
  }

  protected doSend(_request: NotificationRequest): Promise<ProviderResponse> {
    const sid = id('SM');
    return this.transport.call(this.provider, { sid, status: 'queued' }, sid);
  }
}

export class FcmPushSender extends BaseSender {
  constructor(
    provider: Provider,
    private readonly transport: SimulatedTransport,
  ) {
    super(provider);
  }

  protected doSend(_request: NotificationRequest): Promise<ProviderResponse> {
    const name = `projects/notifyhub/messages/${id('')}`;
    return this.transport.call(this.provider, { name }, name);
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

  protected doSend(_request: NotificationRequest): Promise<ProviderResponse> {
    return this.transport.call(this.provider, { ok: true, signature: 'hmac-sha256' }, id('wh_'));
  }
}
