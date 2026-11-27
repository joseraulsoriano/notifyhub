import { isEmbedded, postToShell, shellOrigin } from '@notifyhub/mfe-runtime';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from './types';

/**
 * Puente shell ↔ microfrontend de TaskFlow. La altura, la navegación y los avisos (`notify`) usan el
 * mismo canal `postMessage` que el kit compartido; aquí solo se agrega el traspaso de la sesión.
 * El JWT viaja por `postMessage` al origen exacto del MFE; nunca en una URL.
 */
export const TF_MESSAGE = { ready: 'taskflow:ready', session: 'taskflow:session' } as const;

type Listener = () => void;
let current: Session | null = null;
const listeners = new Set<Listener>();
let started = false;

/** Lado MFE: pide la sesión al shell y escucha cambios (login, logout, expiración). */
export function listenForSession(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const origin = shellOrigin();
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; session?: Session | null } | undefined;
    if (event.source !== window.parent || event.origin !== origin || data?.type !== TF_MESSAGE.session)
      return;
    current = data.session ?? null;
    listeners.forEach((listener) => listener());
  });
  if (isEmbedded()) postToShell({ type: TF_MESSAGE.ready });
}

export const getSession = (): Session | null => current;
export const getToken = (): string | null => current?.token ?? null;

const subscribe = (listener: () => void) => {
  listenForSession();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Sesión entregada por el shell. Usa `useSyncExternalStore` para no perder la respuesta si llega entre el
 * primer render y la suscripción (el shell contesta en cuanto recibe `ready`).
 */
export function useSession(): { session: Session | null; waiting: boolean } {
  const session = useSyncExternalStore(subscribe, getSession, () => null);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    // Si el shell no responde, el MFE deja de esperar y pide iniciar sesión.
    const timer = window.setTimeout(() => setTimedOut(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return { session, waiting: session === null && !timedOut };
}
