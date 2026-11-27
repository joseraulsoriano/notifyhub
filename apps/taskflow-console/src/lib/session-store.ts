import { API_URL, createApi, type Session } from '@taskflow/kit';
import { useSyncExternalStore } from 'react';

const KEY = 'taskflow:session:v1';
const listeners = new Set<() => void>();

function load(): Session | null {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return parsed && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

let session: Session | null = load();

/** Cliente del gateway del shell: usa siempre la sesión vigente. */
export const api = createApi(API_URL, () => session?.token ?? null);

export const getSession = (): Session | null => session;

function commit(next: Session | null) {
  session = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sessionStorage bloqueado: la sesión vive solo en memoria */
  }
  listeners.forEach((listener) => listener());
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSession = (): Session | null => useSyncExternalStore(subscribe, getSession, () => null);

export async function signIn(email: string, password: string): Promise<void> {
  commit(await api.login(email, password));
}

export async function register(name: string, email: string, password: string): Promise<void> {
  await api.register(name, email, password);
  await signIn(email, password);
}

/** Cierra la sesión en el servidor (lista negra en Redis) y luego en el navegador. */
export async function signOut(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* si el servidor no responde, igual se cierra aquí */
  }
  commit(null);
}

/** Descarta la sesión local sin llamar al servidor (p. ej. cuando ya expiró). */
export const dropSession = () => commit(null);
