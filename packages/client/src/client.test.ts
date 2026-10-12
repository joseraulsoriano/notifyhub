import { describe, expect, it, vi } from 'vitest';
import { createNotifyHubClient, NotifyHubError } from './index';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

function setup(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
  const client = createNotifyHubClient({
    baseUrl: 'https://api.example.dev/',
    apiKey: 'nh_key',
    fetch: fetchMock as unknown as typeof fetch,
  });
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { url: String(url), init: init as RequestInit & { headers: Record<string, string> } };
  };
  return { client, fetchMock, lastCall };
}

describe('createNotifyHubClient', () => {
  it('envía la API key y quita la barra final de la URL base', async () => {
    const { client, lastCall } = setup(() => json({ status: 'ok' }));
    await expect(client.health()).resolves.toEqual({ status: 'ok' });
    expect(lastCall().url).toBe('https://api.example.dev/health');
    expect(lastCall().init.headers['X-API-Key']).toBe('nh_key');
  });

  describe('notifications.create', () => {
    const input = {
      sender: { name: 'Demo' },
      recipient: { email: 'a@b.co' },
      message: { body: 'hola' },
      priority: 'alta' as const,
      preferredChannel: 'EMAIL' as const,
    };

    it('genera una Idempotency-Key y reporta si la respuesta fue una repetición', async () => {
      const { client, lastCall } = setup(() =>
        json(
          { id: 'n1', status: 'QUEUED' },
          { status: 202, headers: { 'Idempotent-Replayed': 'true', 'Content-Type': 'application/json' } },
        ),
      );
      const created = await client.notifications.create(input);

      expect(created).toMatchObject({ id: 'n1', replayed: true });
      expect(lastCall().init.method).toBe('POST');
      expect(lastCall().init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.parse(String(lastCall().init.body))).toMatchObject({ priority: 'alta' });
    });

    it('respeta la Idempotency-Key que se le da', async () => {
      const { client, lastCall } = setup(() => json({ id: 'n1' }, { status: 202 }));
      const created = await client.notifications.create(input, { idempotencyKey: 'pedido-4821' });
      expect(lastCall().init.headers['Idempotency-Key']).toBe('pedido-4821');
      expect(created.replayed).toBe(false);
    });
  });

  it('arma la consulta de la lista sin parámetros vacíos', async () => {
    const { client, lastCall } = setup(() => json({ items: [], nextCursor: null }));
    await client.notifications.list({
      status: 'FAILED',
      channel: 'SMS',
      q: 'oferta 20%',
      limit: 10,
      cursor: undefined,
    });
    expect(lastCall().url).toBe(
      'https://api.example.dev/v1/notifications?status=FAILED&channel=SMS&q=oferta+20%25&limit=10',
    );
  });

  it('serializa fechas del filtro de la bitácora en ISO', async () => {
    const { client, lastCall } = setup(() => json({ items: [], nextCursor: null }));
    await client.auditLog.list({ from: new Date('2026-10-12T15:00:00Z'), provider: 'fcm' });
    expect(lastCall().url).toContain('from=2026-10-12T15%3A00%3A00.000Z');
    expect(lastCall().url).toContain('provider=fcm');
  });

  it('codifica el id en la ruta de la notificación y del proveedor', async () => {
    const { client, lastCall } = setup(() => json({}));
    await client.notifications.get('a/b');
    expect(lastCall().url).toBe('https://api.example.dev/v1/notifications/a%2Fb');
    await client.providers.update('fcm', { health: 'DOWN' });
    expect(lastCall().url).toBe('https://api.example.dev/v1/providers/fcm');
    expect(lastCall().init.method).toBe('PATCH');
  });

  it('providers.list devuelve el arreglo directamente', async () => {
    const { client } = setup(() => json({ items: [{ code: 'fcm' }] }));
    await expect(client.providers.list()).resolves.toEqual([{ code: 'fcm' }]);
  });

  describe('errores', () => {
    it('convierte application/problem+json en NotifyHubError', async () => {
      const { client } = setup(() =>
        json(
          { title: 'Solicitud inválida', status: 400, errors: [{ path: 'priority', message: 'requerido' }] },
          { status: 400 },
        ),
      );
      const error = await client.notifications.list().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotifyHubError);
      expect(error).toMatchObject({
        status: 400,
        title: 'Solicitud inválida',
        errors: [{ path: 'priority' }],
      });
    });

    it('expone Retry-After cuando se excede el límite', async () => {
      const { client } = setup(() =>
        json(
          { title: 'TOO_MANY_REQUESTS' },
          { status: 429, headers: { 'Retry-After': '30', 'Content-Type': 'application/json' } },
        ),
      );
      await expect(client.health()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });
    });

    it('un error de red no filtra detalles internos y trae status 0', async () => {
      const { client } = setup(() => {
        throw new TypeError('fetch failed');
      });
      await expect(client.health()).rejects.toMatchObject({ status: 0, title: 'NETWORK_ERROR' });
    });

    it('una respuesta que no es JSON da un error con el código HTTP', async () => {
      const { client } = setup(() => new Response('<html>502</html>', { status: 502 }));
      await expect(client.health()).rejects.toMatchObject({ status: 502, title: 'HTTP 502' });
    });
  });
});
