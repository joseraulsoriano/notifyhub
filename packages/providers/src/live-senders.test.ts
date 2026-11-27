import type { NotificationRequest, Provider } from '@notifyhub/domain';
import { describe, expect, it, vi } from 'vitest';
import { createProductionRegistry, SendGridLiveSender, TwilioLiveSender } from './index';

const provider = (code: string, channel: Provider['channel']): Provider => ({
  code,
  channel,
  costPerMessage: 0,
  reliabilityScore: 95,
  health: 'UP',
  enabled: true,
});

const notification = (overrides: Partial<NotificationRequest> = {}) =>
  ({
    id: 'n1',
    clientAppId: 'app1',
    idempotencyKey: null,
    requestHash: 'hash',
    sender: { name: 'NotifyHub' },
    recipient: { email: 'person@example.com', phone: '+5215512345678' },
    message: { subject: 'Aviso', body: 'Mensaje de prueba' },
    priority: 'MEDIUM',
    preferredChannel: 'EMAIL',
    status: 'QUEUED',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) satisfies NotificationRequest;

describe('adaptadores de producción', () => {
  it('envía correo con SendGrid y no confunde aceptación con entrega final', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 202, headers: { 'x-message-id': 'sg-message-1' } }));
    const sender = new SendGridLiveSender(
      provider('sendgrid', 'EMAIL'),
      { apiKey: 'key', fromEmail: 'notices@example.com', fromName: 'NotifyHub' },
      fetcher,
    );

    const result = await sender.send(notification());

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer key');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      personalizations: [{ to: [{ email: 'person@example.com' }] }],
      from: { email: 'notices@example.com', name: 'NotifyHub' },
      subject: 'Aviso',
      content: [{ type: 'text/plain', value: 'Mensaje de prueba' }],
    });
    expect(result).toMatchObject({
      ok: true,
      providerMessageId: 'sg-message-1',
      delivered: false,
    });
  });

  it('envía SMS con Twilio y omite datos personales de la respuesta persistible', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const sender = new TwilioLiveSender(
      provider('twilio', 'SMS'),
      { accountSid: 'AC123', authToken: 'token', fromNumber: '+15005550006' },
      fetcher,
    );

    const result = await sender.send(notification({ preferredChannel: 'SMS' }));

    const options = fetcher.mock.calls[0]?.[1];
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(new Headers(options?.headers).get('authorization')).toBe(`Basic ${btoa('AC123:token')}`);
    expect(new URLSearchParams(String(options?.body))).toEqual(
      new URLSearchParams({
        To: '+5215512345678',
        From: '+15005550006',
        Body: 'Mensaje de prueba',
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      providerMessageId: 'SM123',
      delivered: false,
    });
    expect(JSON.stringify(result)).not.toContain('+5215512345678');
  });

  it('falla sin reintentos si faltan credenciales y no sustituye proveedores reales por simuladores', async () => {
    const registry = createProductionRegistry({
      sendgrid: {},
      twilio: {},
    });

    await expect(
      registry.getSender(provider('sendgrid', 'EMAIL')).send(notification()),
    ).resolves.toMatchObject({
      ok: false,
      retryable: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
    });
    await expect(
      registry.getSender(provider('twilio', 'SMS')).send(notification({ preferredChannel: 'SMS' })),
    ).resolves.toMatchObject({
      ok: false,
      retryable: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
    });
    await expect(registry.getSender(provider('fcm', 'PUSH')).send(notification())).resolves.toMatchObject({
      ok: false,
      retryable: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
    });
  });

  it('trata los rechazos temporales del proveedor como reintentables', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    const sender = new SendGridLiveSender(
      provider('sendgrid', 'EMAIL'),
      { apiKey: 'key', fromEmail: 'notices@example.com' },
      fetcher,
    );

    await expect(sender.send(notification())).resolves.toMatchObject({
      ok: false,
      retryable: true,
      errorCode: '429 TOO_MANY_REQUESTS',
    });
  });
});
