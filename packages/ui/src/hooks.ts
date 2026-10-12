import {
  isTerminal,
  type AuditEntry,
  type ListAuditLogQuery,
  type ListNotificationsQuery,
  type NotificationDetail,
  type NotificationListItem,
  type NotifyHubClient,
  type Page,
  type Provider,
} from '@notifyhub/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifyHubClient } from './context';

export interface Resource<T> {
  data: T | null;
  error: Error | null;
  /** true solo en la primera carga; las actualizaciones por sondeo no lo activan. */
  loading: boolean;
  refresh: () => Promise<void>;
}

export interface PollingOptions {
  /** Cada cuánto volver a pedir los datos, en ms. 0 o ausente = una sola vez. El sondeo se pausa si la pestaña está oculta. */
  intervalMs?: number;
  enabled?: boolean;
}

function useResource<T>(
  load: (client: NotifyHubClient) => Promise<T>,
  key: string,
  { intervalMs = 0, enabled = true }: PollingOptions = {},
  stopWhen?: (data: T) => boolean,
): Resource<T> {
  const client = useNotifyHubClient();
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: enabled,
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  const stopRef = useRef(stopWhen);
  stopRef.current = stopWhen;
  const run = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, loading: s.data === null }));

    const tick = async () => {
      try {
        const data = await loadRef.current(client);
        if (cancelled) return;
        setState({ data, error: null, loading: false });
        if (intervalMs > 0 && !stopRef.current?.(data)) schedule();
      } catch (error) {
        if (cancelled) return;
        setState((s) => ({
          data: s.data,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        }));
        if (intervalMs > 0) schedule();
      }
    };
    const schedule = () => {
      timer = setTimeout(() => {
        // Con la pestaña oculta no se pide nada; se reintenta en el siguiente ciclo.
        if (typeof document !== 'undefined' && document.hidden) schedule();
        else void tick();
      }, intervalMs);
    };
    run.current = async () => {
      clearTimeout(timer);
      await tick();
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, key, enabled, intervalMs]);

  const refresh = useCallback(() => run.current(), []);
  return { ...state, refresh };
}

/** Lista de notificaciones con filtros. Con `intervalMs` se actualiza sola. */
export function useNotifications(
  query: ListNotificationsQuery = {},
  options?: PollingOptions,
): Resource<Page<NotificationListItem>> {
  return useResource((c) => c.notifications.list(query), `notifications:${JSON.stringify(query)}`, options);
}

/** Detalle con intentos e historial. Se actualiza solo hasta que la notificación termina (entregada o fallida). */
export function useNotification(
  id: string | null,
  options: PollingOptions = { intervalMs: 1500 },
): Resource<NotificationDetail> {
  return useResource(
    (c) => c.notifications.get(id as string),
    `notification:${id}`,
    { ...options, enabled: (options.enabled ?? true) && id !== null },
    (detail) => isTerminal(detail.status),
  );
}

export function useProviders(options?: PollingOptions): Resource<Provider[]> {
  return useResource((c) => c.providers.list(), 'providers', options);
}

export function useAuditLog(
  query: ListAuditLogQuery = {},
  options?: PollingOptions,
): Resource<Page<AuditEntry>> {
  return useResource((c) => c.auditLog.list(query), `audit:${JSON.stringify(query)}`, options);
}
