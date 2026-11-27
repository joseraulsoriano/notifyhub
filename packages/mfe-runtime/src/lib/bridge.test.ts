import { NotifyHubError } from '@notifyhub/client';
import { describe, expect, it } from 'vitest';
import { MESSAGE, answerRpc, isRpcMethod, type RpcMethod } from './bridge';
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
