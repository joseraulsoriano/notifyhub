import { NotifyHubError } from './errors';
import type {
  AuditEntry,
  CreateNotificationInput,
  CreatedNotification,
  ListAuditLogQuery,
  ListNotificationsQuery,
  NotificationDetail,
  NotificationListItem,
  NotifyHubClient,
  Page,
  Provider,
} from './types';

export interface ClientOptions {
  /** URL base de la API, sin barra final: https://notifyhub-api.example.workers.dev */
  baseUrl: string;
  /** Se envía en `X-API-Key`. Úsala solo desde servidores o consolas de confianza. */
  apiKey: string;
  /** Para pruebas o entornos sin `fetch` global. */
  fetch?: typeof fetch;
  /** Tiempo máximo por solicitud. Por defecto 15 s. */
  timeoutMs?: number;
}

type Query = Record<string, string | number | Date | undefined>;

function toQueryString(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Crea el cliente de la API de NotifyHub. */
export function createNotifyHubClient(options: ClientOptions): NotifyHubClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ data: T; headers: Headers }> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'X-API-Key': options.apiKey,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
      throw new NotifyHubError({
        status: 0,
        title: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        detail: timedOut
          ? `La API no respondió en ${timeoutMs} ms`
          : 'No se pudo conectar con la API (¿URL o CORS?)',
      });
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const problem = (payload ?? {}) as {
        title?: string;
        detail?: string;
        errors?: { path: string; message: string }[];
      };
      const retryAfter = Number(response.headers.get('Retry-After'));
      throw new NotifyHubError({
        status: response.status,
        title: problem.title ?? `HTTP ${response.status}`,
        detail: problem.detail,
        errors: problem.errors,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      });
    }
    return { data: payload as T, headers: response.headers };
  }

  return {
    async health() {
      return (await request<{ status: string }>('GET', '/health')).data;
    },
    notifications: {
      async create(input: CreateNotificationInput, opts: { idempotencyKey?: string } = {}) {
        const { data, headers } = await request<Omit<CreatedNotification, 'replayed'>>(
          'POST',
          '/v1/notifications',
          {
            body: input,
            headers: { 'Idempotency-Key': opts.idempotencyKey ?? crypto.randomUUID() },
          },
        );
        return { ...data, replayed: headers.get('Idempotent-Replayed') === 'true' };
      },
      async get(id: string) {
        return (await request<NotificationDetail>('GET', `/v1/notifications/${encodeURIComponent(id)}`)).data;
      },
      async list(query: ListNotificationsQuery = {}) {
        return (
          await request<Page<NotificationListItem>>('GET', `/v1/notifications${toQueryString({ ...query })}`)
        ).data;
      },
    },
    providers: {
      async list() {
        return (await request<{ items: Provider[] }>('GET', '/v1/providers')).data.items;
      },
      async update(code, patch) {
        return (
          await request<Provider>('PATCH', `/v1/providers/${encodeURIComponent(code)}`, { body: patch })
        ).data;
      },
    },
    auditLog: {
      async list(query: ListAuditLogQuery = {}) {
        return (await request<Page<AuditEntry>>('GET', `/v1/audit-log${toQueryString({ ...query })}`)).data;
      },
    },
  };
}
