import type { NotificationRequest } from '@notifyhub/domain';
import { BaseSender, type ProviderResponse } from './base-sender';
import type { SimulatedTransport } from './simulated-transport';
import type { Provider } from '@notifyhub/domain';
import type { NotificationSender } from '@notifyhub/application';

export interface SendGridConfig {
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface TwilioConfig {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}

export interface ProductionProviderConfig {
  sendgrid: SendGridConfig;
  twilio: TwilioConfig;
}

type Fetcher = typeof fetch;

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

export class SendGridLiveSender extends BaseSender {
  protected override readonly confirmsDelivery = false;

  constructor(
    provider: Provider,
    private readonly config: SendGridConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {
    super(provider);
  }

  protected async doSend(
    request: NotificationRequest,
    _idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const { apiKey, fromEmail } = this.config;
    if (!apiKey || !fromEmail) {
      return {
        status: 400,
        body: {},
        latencyMs: 0,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      };
    }

    const startedAt = Date.now();
    const response = await this.fetcher('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: request.recipient.email }] }],
        from: { email: fromEmail, name: this.config.fromName ?? request.sender.name },
        ...(request.message.subject ? { subject: request.message.subject } : {}),
        content: [{ type: 'text/plain', value: request.message.body }],
      }),
      signal,
    });

    return {
      status: response.status,
      body: {},
      latencyMs: Date.now() - startedAt,
      ...(response.headers.get('x-message-id') ? { messageId: response.headers.get('x-message-id')! } : {}),
    };
  }
}

export class TwilioLiveSender extends BaseSender {
  protected override readonly confirmsDelivery = false;

  constructor(
    provider: Provider,
    private readonly config: TwilioConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {
    super(provider);
  }

  protected async doSend(
    request: NotificationRequest,
    _idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const { accountSid, authToken, fromNumber } = this.config;
    if (!accountSid || !authToken || !fromNumber) {
      return {
        status: 400,
        body: {},
        latencyMs: 0,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      };
    }

    const startedAt = Date.now();
    const response = await this.fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: request.recipient.phone!,
          From: fromNumber,
          Body: request.message.body,
        }),
        signal,
      },
    );

    const payload: unknown = await response.json().catch(() => undefined);
    const details =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const messageId = typeof details.sid === 'string' ? details.sid : undefined;
    const code = typeof details.code === 'number' ? `TWILIO_${details.code}` : undefined;

    return {
      status: response.ok && !messageId ? 502 : response.status,
      body: code ? { code: details.code } : {},
      latencyMs: Date.now() - startedAt,
      ...(messageId ? { messageId } : {}),
      ...(!response.ok && code ? { errorCode: code } : {}),
      ...(response.ok && !messageId ? { errorCode: 'TWILIO_INVALID_RESPONSE' } : {}),
    };
  }
}

export class UnconfiguredSender implements NotificationSender {
  constructor(private readonly provider: Provider) {}

  get providerCode() {
    return this.provider.code;
  }

  get channel() {
    return this.provider.channel;
  }

  async send() {
    return {
      ok: false as const,
      retryable: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      latencyMs: 0,
    };
  }
}
