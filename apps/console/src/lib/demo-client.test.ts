import { NotifyHubError } from '@notifyhub/client';
import { describe, expect, it } from 'vitest';
import { createDemoClient } from './demo-client';

const T0 = new Date('2026-10-12T15:00:00Z').getTime();
const input = (over: Record<string, unknown> = {}) =>
  ({
    sender: { name: 'Demo' },
    recipient: { email: 'ana@example.com', phone: '+5215512345678', deviceToken: 'fcm:APA91bHe41a0000' },
    message: { subject: 'Hola', body: 'Cuerpo' },
    priority: 'alta',
    preferredChannel: 'PUSH',
    ...over,
  }) as Parameters<ReturnType<typeof createDemoClient>['notifications']['create']>[0];

/** Cliente con reloj controlable y almacenamiento en memoria. */
function setup() {
  let now = T0;
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const make = () => createDemoClient({ now: () => now, storage });
  return { client: make(), make, advance: (ms: number) => (now += ms), storage };
}

describe('cliente de demostración', () => {
  it('trae datos de ejemplo coherentes: entregadas, fallback, fallidas y en curso', async () => {
    const { client } = setup();
    const { items } = await client.notifications.list({ limit: 100 });
    const status = (s: string) => items.filter((i) => i.status === s).length;

    expect(items).toHaveLength(13);
    expect(status('DELIVERED')).toBeGreaterThanOrEqual(5);
    expect(status('FAILED')).toBe(2);
    expect(items.some((i) => i.usedFallback && i.status === 'DELIVERED')).toBe(true);
    expect(['QUEUED', 'SENDING', 'RETRYING', 'RECEIVED'].every((s) => status(s) >= 1)).toBe(true);
  });

  it('enmascara los datos de contacto igual que la API', async () => {
    const { client } = setup();
    const { items } = await client.notifications.list({ limit: 100 });
    const raw = JSON.stringify(items);
    expect(raw).not.toContain('ana.lopez');
    expect(raw).not.toContain('5512345678');
    expect(items.find((i) => i.preferredChannel === 'EMAIL')!.recipient).toMatch(/^.\*\*\*@/);
  });

  describe('crear una notificación', () => {
    it('responde QUEUED al instante y la va "entregando" con el paso del tiempo', async () => {
      const { client, advance } = setup();
      const created = await client.notifications.create(input({ preferredChannel: 'EMAIL' }));
      expect(created.status).toBe('QUEUED');

      expect((await client.notifications.get(created.id)).status).toBe('QUEUED');
      advance(10_000);
      const done = await client.notifications.get(created.id);
      expect(done.status).toBe('DELIVERED');
      expect(done.attempts.map((a) => [a.provider, a.status])).toEqual([['sendgrid', 'SENT']]);
    });

    it('con un proveedor caído reintenta tres veces y hace fallback al siguiente canal', async () => {
      const { client, advance } = setup();
      await client.providers.update('fcm', { health: 'DOWN' });
      const created = await client.notifications.create(input());
      advance(60_000);
      const detail = await client.notifications.get(created.id);

      expect(detail.status).toBe('DELIVERED');
      expect(detail.attempts.map((a) => [a.provider, a.status, a.isFallback])).toEqual([
        ['fcm', 'RETRYING', false],
        ['fcm', 'RETRYING', false],
        ['fcm', 'FAILED', false],
        ['twilio', 'SENT', true],
      ]);
      expect(detail.history.map((h) => h.to)).toContain('FALLBACK');
      expect(detail.attempts[0]!.errorCode).toBe('503 UNAVAILABLE');
    });

    it('si ningún canal responde queda FAILED', async () => {
      const { client, advance } = setup();
      for (const p of ['fcm', 'twilio', 'sendgrid']) await client.providers.update(p, { health: 'DOWN' });
      const created = await client.notifications.create(input());
      advance(120_000);
      const detail = await client.notifications.get(created.id);

      expect(detail.status).toBe('FAILED');
      expect(detail.attempts).toHaveLength(9);
    });

    it('un proveedor deshabilitado no entrega (se trata como caído)', async () => {
      const { client, advance } = setup();
      await client.providers.update('sendgrid', { enabled: false });
      const created = await client.notifications.create(input({ preferredChannel: 'EMAIL' }));
      advance(60_000);
      const detail = await client.notifications.get(created.id);
      expect(detail.attempts[0]).toMatchObject({ provider: 'sendgrid', status: 'RETRYING' });
    });

    it('solo usa los canales con dato de contacto', async () => {
      const { client, advance } = setup();
      await client.providers.update('fcm', { health: 'DOWN' });
      const created = await client.notifications.create(
        input({ recipient: { deviceToken: 'fcm:APA91bHe41a0000' } }),
      );
      advance(120_000);
      const detail = await client.notifications.get(created.id);
      expect(detail.status).toBe('FAILED');
      expect(new Set(detail.attempts.map((a) => a.provider))).toEqual(new Set(['fcm']));
    });

    it('repetir la Idempotency-Key no duplica la notificación', async () => {
      const { client } = setup();
      const first = await client.notifications.create(input(), { idempotencyKey: 'pedido-1' });
      const again = await client.notifications.create(input(), { idempotencyKey: 'pedido-1' });
      expect(again.replayed).toBe(true);
      expect(again.id).toBe(first.id);
      expect((await client.notifications.list({ limit: 100 })).items).toHaveLength(14);
    });
  });

  describe('lista', () => {
    it('filtra por estado, canal, prioridad y texto', async () => {
      const { client } = setup();
      expect(
        (await client.notifications.list({ channel: 'SMS' })).items.every(
          (i) => i.preferredChannel === 'SMS',
        ),
      ).toBe(true);
      expect((await client.notifications.list({ status: 'FAILED' })).items).toHaveLength(2);
      expect((await client.notifications.list({ q: 'oferta' })).items.length).toBeGreaterThanOrEqual(1);
      expect((await client.notifications.list({ q: 'zzz' })).items).toHaveLength(0);
    });

    it('ordena de la más reciente a la más antigua y pagina con cursor', async () => {
      const { client } = setup();
      const first = await client.notifications.list({ limit: 5 });
      expect(first.items).toHaveLength(5);
      expect(first.nextCursor).toBeTruthy();
      const dates = first.items.map((i) => i.createdAt);
      expect([...dates].sort().reverse()).toEqual(dates);

      const second = await client.notifications.list({ limit: 5, cursor: first.nextCursor! });
      expect(second.items.some((i) => first.items.some((f) => f.id === i.id))).toBe(false);
    });
  });

  it('get de un id inexistente da un NotifyHubError 404, como la API', async () => {
    const { client } = setup();
    await expect(client.notifications.get('nope')).rejects.toBeInstanceOf(NotifyHubError);
    await expect(client.notifications.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('la bitácora refleja cambios de estado e intentos y se puede filtrar', async () => {
    const { client, advance } = setup();
    await client.providers.update('fcm', { health: 'DOWN' });
    const created = await client.notifications.create(input());
    advance(60_000);

    const own = await client.auditLog.list({ notificationId: created.id, limit: 100 });
    const events = own.items.map((e) => e.eventType);
    expect(events).toContain('notification.received');
    expect(events.filter((e) => e === 'delivery.attempt')).toHaveLength(4);
    expect(
      (await client.auditLog.list({ provider: 'fcm', status: 'FAILED' })).items.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('lo creado y la salud de los proveedores sobreviven a cambiar de página', async () => {
    const { client, make, advance } = setup();
    await client.providers.update('twilio', { health: 'DEGRADED' });
    const created = await client.notifications.create(input({ preferredChannel: 'EMAIL' }));
    advance(10_000);

    const reloaded = make(); // otra "página": mismo almacenamiento
    expect((await reloaded.providers.list()).find((p) => p.code === 'twilio')!.health).toBe('DEGRADED');
    expect((await reloaded.notifications.get(created.id)).status).toBe('DELIVERED');
  });

  it('actualizar un proveedor que no existe da 404', async () => {
    const { client } = setup();
    await expect(client.providers.update('nope', { enabled: false })).rejects.toMatchObject({ status: 404 });
  });
});
