import { NotifyHubError } from '@notifyhub/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE, answerRpc, isRpcMethod, shellOrigin, type RpcMethod } from './bridge';
import { createDemoClient } from './demo-client';

const request = (method: RpcMethod, args: unknown[] = []) => ({
  type: MESSAGE.rpc,
  id: 'r1',
  method,
  args,
});

describe('puente shell ↔ microfrontend', () => {
  it('solo acepta métodos de la lista cerrada', () => {
    expect(isRpcMethod('notifications.list')).toBe(true);
    expect(isRpcMethod('providers.update')).toBe(true);
    expect(isRpcMethod('constructor')).toBe(false);
    expect(isRpcMethod('notifications.__proto__')).toBe(false);
    expect(isRpcMethod(42)).toBe(false);
  });

  it('responde con el resultado del cliente demo', async () => {
    const client = createDemoClient();
    const result = await answerRpc(client, request('providers.list'));
    expect(result).toMatchObject({ type: MESSAGE.rpcResult, id: 'r1', ok: true });
    expect(result.ok && (result.value as unknown[]).length).toBe(4);
  });

  it('serializa los errores del SDK para reconstruirlos en el MFE', async () => {
    const client = createDemoClient();
    client.notifications.get = () =>
      Promise.reject(new NotifyHubError({ status: 404, title: 'No encontrada', detail: 'id inexistente' }));
    const result = await answerRpc(client, request('notifications.get', ['x']));
    expect(result).toEqual({
      type: MESSAGE.rpcResult,
      id: 'r1',
      ok: false,
      error: {
        status: 404,
        title: 'No encontrada',
        detail: 'id inexistente',
        errors: undefined,
        retryAfterSeconds: undefined,
      },
    });
  });

  it('rechaza un método que no existe en el cliente', async () => {
    const result = await answerRpc(createDemoClient(), {
      ...request('health'),
      method: 'nada.raro' as RpcMethod,
    });
    expect(result).toMatchObject({ ok: false, error: { status: 400 } });
  });
});

describe('shellOrigin', () => {
  const embed = (referrer: string) => {
    const self = { parent: {} } as unknown as Window;
    vi.stubGlobal('window', self);
    vi.stubGlobal('document', { referrer });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('usa el origen del referrer cuando el navegador lo entrega', () => {
    embed('https://shell.test/notificaciones?x=1');
    expect(shellOrigin()).toBe('https://shell.test');
  });

  it('cae al origen configurado si el referrer está oculto (Referrer-Policy: no-referrer)', () => {
    embed('');
    expect(shellOrigin()).toBe('http://localhost:4321');
  });

  it('es null cuando la página corre suelta', () => {
    const self = {} as Window & { parent: unknown };
    self.parent = self;
    vi.stubGlobal('window', self);
    expect(shellOrigin()).toBeNull();
  });
});
