/**
 * Contrato estricto de una notificación de interfaz. Todos los microfrontends emiten esta forma y el
 * módulo de notificaciones del shell decide *cómo* se muestra, se encola y se descarta; cada MFE decide
 * solo *cuándo* ocurre un evento de su dominio.
 */
export const NOTIFY_EVENT = 'app:notify';
export const NOTIFY_CHANNEL = 'notifyhub:notifications';

export const SEVERITIES = ['info', 'success', 'warning', 'error'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type AppNotification = {
  id: string;
  severity: Severity;
  title: string;
  message?: string;
  /** Microfrontend que la emitió. Lo fija el shell según el iframe, no lo que diga el mensaje. */
  sourceMfe: string;
  /** Ruta interna del shell (`/notificaciones`…). Nunca una URL externa. */
  actionUrl?: string;
  /** Segundos que vive en la bandeja antes de expirar. `0` = no expira. */
  ttl: number;
  createdAt: number;
};

/** Lo que un microfrontend pasa a `notify()`. */
export type NotifyInput = {
  severity?: Severity;
  title: string;
  message?: string;
  actionUrl?: string;
  ttl?: number;
};

export const DEFAULT_TTL_SECONDS = 3600;
const MAX_TTL_SECONDS = 86_400;
const MAX_TITLE = 120;
const MAX_MESSAGE = 500;
const MAX_ACTION_URL = 200;
const SOURCE_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Solo rutas internas del shell: nada de `//host`, esquemas ni caracteres de control. */
export function isInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_ACTION_URL &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    // eslint-disable-next-line no-control-regex
    !/[\\\u0000-\u001f]/.test(value)
  );
}

/**
 * Valida y normaliza lo que llega (por `postMessage`, `CustomEvent` o `BroadcastChannel`). Devuelve `null`
 * si no cumple el contrato; el valor recibido nunca se confía.
 */
export function parseNotification(
  input: unknown,
  options: { sourceMfe: string; now?: number },
): AppNotification | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title.length === 0 || title.length > MAX_TITLE) return null;

  const severity = raw.severity ?? 'info';
  if (typeof severity !== 'string' || !(SEVERITIES as readonly string[]).includes(severity)) return null;

  let message: string | undefined;
  if (raw.message !== undefined) {
    if (typeof raw.message !== 'string' || raw.message.length > MAX_MESSAGE) return null;
    message = raw.message.trim() || undefined;
  }

  let ttl = DEFAULT_TTL_SECONDS;
  if (raw.ttl !== undefined) {
    if (typeof raw.ttl !== 'number' || !Number.isFinite(raw.ttl) || raw.ttl < 0 || raw.ttl > MAX_TTL_SECONDS)
      return null;
    ttl = Math.floor(raw.ttl);
  }

  const sourceMfe = SOURCE_PATTERN.test(options.sourceMfe) ? options.sourceMfe : 'desconocido';
  const id = typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : crypto.randomUUID();

  return {
    id,
    severity: severity as Severity,
    title,
    message,
    sourceMfe,
    actionUrl: isInternalPath(raw.actionUrl) ? raw.actionUrl : undefined,
    ttl,
    createdAt: options.now ?? Date.now(),
  };
}

export const isExpired = (item: AppNotification, now: number): boolean =>
  item.ttl > 0 && now >= item.createdAt + item.ttl * 1000;
