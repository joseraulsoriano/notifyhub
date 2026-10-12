import type { NotificationRequest, Provider } from '@notifyhub/domain';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './creators';
import { SimulatedTransport } from './simulated-transport';

const provider = (code: string, channel: Provider['channel'], over: Partial<Provider> = {}): Provider => ({
  code,
  channel,
  costPerMessage: 0,
  reliabilityScore: 95,
  health: 'UP',
  enabled: true,
  ...over,
});

const request = (recipient: NotificationRequest['recipient']) =>
  ({ id: 'n1', recipient, message: { body: 'x' } }) as NotificationRequest;

const contact = {
  email: 'a@b.co',
  phone: '+5215512345678',
  deviceToken: 'fcm:APA91bHe41a0000',
  webhookUrl: 'https://erp.cliente.mx/hook',
};
const instant = (random: () => number = () => 0.9) =>
  new SimulatedTransport({ random, sleep: async () => {} });

describe('emisores simulados', () => {
  it('un proveedor UP entrega y, salvo el webhook, confirma la entrega', async () => {
    const registry = createDefaultRegistry(instant());
    const email = await registry.getSender(provider('sendgrid', 'EMAIL')).send(request(contact));
    const webhook = await registry.getSender(provider('webhook', 'WEBHOOK')).send(request(contact));

    expect(email).toMatchObject({ ok: true, delivered: true });
    expect(webhook).toMatchObject({ ok: true, delivered: false });
    expect(email.ok && email.providerMessageId).toMatch(/^sg_/);
  });

  it('un proveedor DOWN siempre responde 503 y el error es reintentable', async () => {
    const registry = createDefaultRegistry(instant(() => 0));
    const result = await registry
      .getSender(provider('fcm', 'PUSH', { health: 'DOWN' }))
      .send(request(contact));

    expect(result).toMatchObject({ ok: false, retryable: true, errorCode: '503 UNAVAILABLE' });
    expect(result.latencyMs).toBeGreaterThanOrEqual(1600);
  });

  it('un proveedor DEGRADED falla según el azar y es más lento aunque acierte', async () => {
    const registry = createDefaultRegistry(instant(() => 0.2)); // 0.2 < 0.5 → falla
    const failing = await registry
      .getSender(provider('twilio', 'SMS', { health: 'DEGRADED' }))
      .send(request(contact));
    expect(failing.ok).toBe(false);

    const lucky = createDefaultRegistry(instant(() => 0.9));
    const ok = await lucky
      .getSender(provider('twilio', 'SMS', { health: 'DEGRADED' }))
      .send(request(contact));
    expect(ok.ok).toBe(true);
    expect(ok.latencyMs).toBeGreaterThan(900);
  });

  it('rechaza sin reintentos si falta el dato de contacto del canal', async () => {
    const registry = createDefaultRegistry(instant());
    const result = await registry
      .getSender(provider('sendgrid', 'EMAIL'))
      .send(request({ phone: '+5215512345678' }));

    expect(result).toMatchObject({ ok: false, retryable: false, errorCode: 'INVALID_RECIPIENT' });
  });

  it('la respuesta guardada no contiene datos personales', async () => {
    const registry = createDefaultRegistry(instant());
    const result = await registry.getSender(provider('twilio', 'SMS')).send(request(contact));
    expect(JSON.stringify(result)).not.toContain('5512345678');
    expect(JSON.stringify(result)).not.toContain('a@b.co');
  });

  it('el registro tiene los cuatro proveedores del catálogo y falla con uno desconocido', () => {
    const registry = createDefaultRegistry(instant());
    expect(['sendgrid', 'twilio', 'fcm', 'webhook'].every((c) => registry.has(c))).toBe(true);
    expect(() => registry.getSender(provider('otro', 'EMAIL'))).toThrow(/otro/);
  });
});
