import { createNotifyHubClient, type NotifyHubClient } from '@notifyhub/client';
import { useSyncExternalStore } from 'react';
import { createDemoClient } from './demo-client';

/** A qué backend habla la consola: la API real o el modo demo con datos de ejemplo. */
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

const build = (connection: Connection): State => ({
  connection,
  client:
    connection.mode === 'live'
      ? createNotifyHubClient({ baseUrl: connection.baseUrl, apiKey: connection.apiKey })
      : createDemoClient({ storage: tabStorage() }),
});

let state: State | null = null;
let serverState: State | null = null;
const listeners = new Set<() => void>();

const current = () => (state ??= build(read()));
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

export function useConnection(): State {
  return useSyncExternalStore(subscribe, current, server);
}
