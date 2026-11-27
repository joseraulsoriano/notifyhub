import { NotifyHubError, type NotifyHubClient } from '@notifyhub/client';

/**
 * Contrato entre el shell (`apps/console`) y los microfrontends embebidos en `iframe`.
 *
 * MFE → shell: `ready`, `height` (alto del contenido), `navigate` (ir a otra ruta del shell), `notify`
 * (aviso para el módulo de notificaciones del shell) y `rpc`
 * (llamada al cliente demo del shell). Shell → MFE: `connection` y `rpc-result`.
 * Cada lado valida el origen y la ventana que envía; la API key nunca viaja en una URL.
 */
export const MESSAGE = {
  ready: 'notifyhub:mfe-ready',
  height: 'notifyhub:mfe-height',
  navigate: 'notifyhub:navigate',
  notify: 'notifyhub:notify',
  rpc: 'notifyhub:rpc',
  rpcResult: 'notifyhub:rpc-result',
  connection: 'notifyhub:connection',
} as const;

/** Métodos del SDK que un MFE puede pedirle al cliente demo del shell. Nada fuera de esta lista se ejecuta. */
export const RPC_METHODS = [
  'health',
  'notifications.create',
  'notifications.get',
  'notifications.list',
  'providers.list',
  'providers.update',
  'dispatch.capacity',
  'subscriptions.list',
  'subscriptions.create',
  'subscriptions.setActive',
  'auditLog.list',
] as const;
export type RpcMethod = (typeof RPC_METHODS)[number];

export type RpcRequest = { type: typeof MESSAGE.rpc; id: string; method: RpcMethod; args: unknown[] };
export type RpcResult =
  | { type: typeof MESSAGE.rpcResult; id: string; ok: true; value: unknown }
  | { type: typeof MESSAGE.rpcResult; id: string; ok: false; error: SerializedError };
type SerializedError = {
  status: number;
  title: string;
  detail?: string;
  errors?: { path: string; message: string }[];
  retryAfterSeconds?: number;
};

export const isRpcMethod = (value: unknown): value is RpcMethod =>
  typeof value === 'string' && (RPC_METHODS as readonly string[]).includes(value);

/** ¿Esta página corre dentro del shell? */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

/** Origen del shell que embebe este MFE (del `referrer`), o `null` si corre suelto. */
export function shellOrigin(): string | null {
  if (!isEmbedded() || !document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

const SHELL_URL: string =
  import.meta.env.PUBLIC_SHELL_URL ??
  (import.meta.env.PROD ? 'https://notifyhub-console.sc202357155.workers.dev' : 'http://localhost:4321');

/**
 * Enlace a una ruta del shell (`/notificaciones`, `/nueva`…). Las rutas siempre son del shell: así la URL
 * del navegador es la misma para el usuario, esté o no el MFE embebido.
 */
export function shellLink(path: string): { href: string; target: '_top' } {
  return { href: new URL(path, shellOrigin() ?? SHELL_URL).toString(), target: '_top' };
}

/** Navega el shell a otra ruta (sin depender de que el navegador permita al iframe mover la ventana). */
export function navigateShell(path: string): void {
  const origin = shellOrigin();
  if (origin) window.parent.postMessage({ type: MESSAGE.navigate, path }, origin);
  else window.location.href = shellLink(path).href;
}

export function postToShell(message: Record<string, unknown>): void {
  const origin = shellOrigin();
  if (origin) window.parent.postMessage(message, origin);
}

/** Reporta al shell el alto del contenido para que el iframe no tenga scroll propio. */
export function reportHeight(): () => void {
  if (!isEmbedded()) return () => {};
  let last = 0;
  const send = () => {
    const height = Math.ceil(document.body.getBoundingClientRect().height);
    if (height !== last) {
      last = height;
      postToShell({ type: MESSAGE.height, height });
    }
  };
  const observer = new ResizeObserver(send);
  observer.observe(document.body);
  send();
  return () => observer.disconnect();
}

/**
 * Cliente que delega en el cliente demo del shell. En modo demo todos los MFE ven así los mismos datos,
 * aunque cada uno viva en otro origen (con su propio `sessionStorage`).
 */
export function createShellClient(): NotifyHubClient {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const origin = shellOrigin();

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as RpcResult | undefined;
    if (event.source !== window.parent || event.origin !== origin || data?.type !== MESSAGE.rpcResult) return;
    const call = pending.get(data.id);
    if (!call) return;
    pending.delete(data.id);
    if (data.ok) call.resolve(data.value);
    else call.reject(new NotifyHubError(data.error));
  });

  const call =
    <T>(method: RpcMethod) =>
    (...args: unknown[]): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        if (!origin) {
          reject(new NotifyHubError({ status: 0, title: 'El shell no está disponible' }));
          return;
        }
        const id = crypto.randomUUID();
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        window.parent.postMessage({ type: MESSAGE.rpc, id, method, args } satisfies RpcRequest, origin);
      });

  return {
    health: call('health'),
    notifications: {
      create: call('notifications.create'),
      get: call('notifications.get'),
      list: call('notifications.list'),
    },
    providers: { list: call('providers.list'), update: call('providers.update') },
    dispatch: { capacity: call('dispatch.capacity') },
    subscriptions: {
      list: call('subscriptions.list'),
      create: call('subscriptions.create'),
      setActive: call('subscriptions.setActive'),
    },
    auditLog: { list: call('auditLog.list') },
  };
}

/** Lado del shell: ejecuta una llamada permitida sobre su cliente y arma la respuesta. */
export async function answerRpc(client: NotifyHubClient, request: RpcRequest): Promise<RpcResult> {
  const [scope, name] = request.method.split('.') as [string, string | undefined];
  const target = name
    ? (client as unknown as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>)[scope]
    : (client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>);
  const fn = target?.[name ?? scope];
  try {
    if (typeof fn !== 'function') throw new NotifyHubError({ status: 400, title: 'Método no permitido' });
    const value = await fn.apply(target, request.args);
    return { type: MESSAGE.rpcResult, id: request.id, ok: true, value };
  } catch (cause) {
    const error: SerializedError =
      cause instanceof NotifyHubError
        ? {
            status: cause.status,
            title: cause.title,
            detail: cause.detail,
            errors: cause.errors,
            retryAfterSeconds: cause.retryAfterSeconds,
          }
        : { status: 500, title: cause instanceof Error ? cause.message : 'Error desconocido' };
    return { type: MESSAGE.rpcResult, id: request.id, ok: false, error };
  }
}
