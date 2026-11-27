import { createNotifyHubClient, type NotifyHubClient } from '@notifyhub/client';
import { useSyncExternalStore } from 'react';
import { MESSAGE, createShellClient, isEmbedded, postToShell, shellOrigin } from './bridge';
import { createDemoClient } from './demo-client';

/** A qué backend habla la consola: la API real o el modo demo en memoria. */
export type Connection = { mode: 'demo' } | { mode: 'live'; baseUrl: string; apiKey: string };

const STORAGE_KEY = 'notifyhub:connection';

/** URL sugerida en el diálogo «Conectar» (variable PUBLIC_NOTIFYHUB_API_URL al compilar). */
export const DEFAULT_API_URL: string = import.meta.env.PUBLIC_NOTIFYHUB_API_URL ?? '';

const DEMO: Connection = { mode: 'demo' };

/** La conexión (con la API key) se guarda solo en esta pestaña: se borra al cerrarla. */
function tabStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function read(): Connection {
  try {
    const saved = JSON.parse(tabStorage()?.getItem(STORAGE_KEY) ?? 'null') as Partial<
      Connection & { baseUrl: string; apiKey: string }
    > | null;
    return saved?.mode === 'live' && typeof saved.baseUrl === 'string' && typeof saved.apiKey === 'string'
      ? { mode: 'live', baseUrl: saved.baseUrl, apiKey: saved.apiKey }
      : DEMO;
  } catch {
    return DEMO;
  }
}

interface State {
  connection: Connection;
  client: NotifyHubClient;
}

let shellClient: NotifyHubClient | null = null;

/** Demo suelto: datos en memoria de esta pestaña. Demo embebido: los del shell, compartidos por todos los MFE. */
function demoClient(): NotifyHubClient {
  if (isEmbedded() && shellOrigin()) return (shellClient ??= createShellClient());
  return createDemoClient({ storage: tabStorage() });
}

const build = (connection: Connection): State => ({
  connection,
  client:
    connection.mode === 'live'
      ? createNotifyHubClient({ baseUrl: connection.baseUrl, apiKey: connection.apiKey })
      : demoClient(),
});

let state: State | null = null;
let serverState: State | null = null;
const listeners = new Set<() => void>();

// Embebido, la conexión la decide el shell: no se toma la que haya quedado guardada en este origen.
const current = () => (state ??= build(isEmbedded() ? DEMO : read()));
// Mientras se renderiza en el servidor (y se hidrata) siempre es el modo demo.
const server = () => (serverState ??= build(DEMO));
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setConnection(connection: Connection) {
  try {
    if (connection.mode === 'live') tabStorage()?.setItem(STORAGE_KEY, JSON.stringify(connection));
    else tabStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // sin almacenamiento: la conexión dura lo que dure la página
  }
  state = build(connection);
  listeners.forEach((l) => l());
}

const same = (a: Connection, b: Connection) => JSON.stringify(a) === JSON.stringify(b);

function isConnection(value: unknown): value is Connection {
  const item = value as Partial<{ mode: string; baseUrl: unknown; apiKey: unknown }> | null;
  return (
    item?.mode === 'demo' ||
    (item?.mode === 'live' && typeof item.baseUrl === 'string' && typeof item.apiKey === 'string')
  );
}

/**
 * Dentro del shell: avisa que el MFE está listo y adopta la conexión que el shell le manda. Devuelve la
 * función para dejar de escuchar. Fuera del shell no hace nada.
 */
export function listenToShell(): () => void {
  const origin = shellOrigin();
  if (!origin) return () => {};
  const receive = (event: MessageEvent) => {
    const data = event.data as { type?: string; connection?: unknown } | undefined;
    if (event.source !== window.parent || event.origin !== origin || data?.type !== MESSAGE.connection)
      return;
    if (!isConnection(data.connection) || same(data.connection, current().connection)) return;
    state = build(data.connection);
    listeners.forEach((l) => l());
  };
  window.addEventListener('message', receive);
  postToShell({ type: MESSAGE.ready });
  return () => window.removeEventListener('message', receive);
}

export function useConnection(): State {
  return useSyncExternalStore(subscribe, current, server);
}
