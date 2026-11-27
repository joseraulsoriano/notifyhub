import { NOTIFY_EVENT, parseNotification, type AppNotification } from '@notifyhub/mfe-runtime';
import { STATUS_LABEL, type ServerNotification } from '@taskflow/kit';
import { useEffect } from 'react';
import { api, dropSession, useSession } from './session-store';

const SIX_HOURS = 6 * 3600;

/** Emite una notificación de interfaz hacia el módulo centralizado (bandeja + toast). */
export function emit(input: Record<string, unknown>, sourceMfe: string): void {
  const item = parseNotification(input, { sourceMfe });
  if (item) window.dispatchEvent(new CustomEvent<AppNotification>(NOTIFY_EVENT, { detail: item }));
}

/** Traduce lo que publicó el servicio de notificaciones (Redis pub/sub → SSE) al contrato de la interfaz. */
export function fromServer(item: ServerNotification): Record<string, unknown> {
  const task = item.payload.task;
  const title = task?.title ?? 'una tarea';
  if (item.event_type === 'task_assigned')
    return {
      id: item.id,
      severity: 'info',
      title: 'Te asignaron una tarea',
      message: title,
      actionUrl: '/',
      ttl: SIX_HOURS,
    };
  const status = task?.status ? STATUS_LABEL[task.status] : 'otro estado';
  return {
    id: item.id,
    severity: task?.status === 'completed' ? 'success' : 'info',
    title: 'Cambió el estado de una tarea',
    message: `${title} → ${status}`,
    actionUrl: '/',
    ttl: SIX_HOURS,
  };
}

/**
 * Mientras haya sesión: mantiene abierto el stream SSE del notification-service (con reconexión) y avisa
 * cuando la sesión expira. El estado "usuario en línea" y la sesión viven en Redis con el mismo TTL.
 */
export function useSessionEffects(): void {
  const session = useSession();

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let delay = 1000;
    (async () => {
      while (!controller.signal.aborted) {
        try {
          await api.notifications.stream((item) => {
            delay = 1000;
            emit(fromServer(item), 'notification-service');
          }, controller.signal);
        } catch {
          if (controller.signal.aborted) return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 15_000);
      }
    })();
    return () => controller.abort();
  }, [session?.token]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(
      () => {
        emit(
          {
            severity: 'warning',
            title: 'Tu sesión expiró',
            message: 'Inicia sesión de nuevo para continuar.',
            ttl: 0,
          },
          'auth-service',
        );
        dropSession();
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [session?.token, session?.expiresAt]);
}
