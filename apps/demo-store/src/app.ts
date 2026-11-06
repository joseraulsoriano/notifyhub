import { createNotifyHubClient, NotifyHubError } from '@notifyhub/client';
import { buildNotification, parseEventRequest, TEMPLATES } from './events';
import { renderPage } from './page';

/** Configuración de la tienda; la dan Cloudflare (env) o Vercel (process.env). */
export interface StoreConfig {
  STORE_NAME: string;
  NOTIFYHUB_API_URL: string;
  NOTIFYHUB_API_KEY?: string;
  CONSOLE_URL: string;
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function problem(status: number, detail: string) {
  return Response.json({ detail }, { status });
}

function fromNotifyHub(error: unknown) {
  if (error instanceof NotifyHubError) {
    const fields = error.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
    const detail = [error.title, error.detail, fields].filter(Boolean).join(' · ');
    // 0 = no hubo respuesta (red o timeout): para el navegador es un 502.
    return problem(error.status === 0 ? 502 : error.status, `NotifyHub: ${detail}`);
  }
  throw error;
}

/** Atiende una petición de la tienda. Es igual en Cloudflare Workers y en Vercel Functions. */
export async function handleRequest(request: Request, env: StoreConfig): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/') {
    return new Response(renderPage({ storeName: env.STORE_NAME, consoleUrl: env.CONSOLE_URL }), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
  if (!url.pathname.startsWith('/api/')) return problem(404, 'no encontrado');
  if (!env.NOTIFYHUB_API_KEY) {
    return problem(500, 'Falta NOTIFYHUB_API_KEY (en local: copia .dev.vars.example a .dev.vars)');
  }
  // La llave vive solo en el servidor de la tienda; el navegador nunca la ve.
  const notifyhub = createNotifyHubClient({
    baseUrl: env.NOTIFYHUB_API_URL,
    apiKey: env.NOTIFYHUB_API_KEY,
    timeoutMs: 10_000,
  });

  if (request.method === 'POST' && url.pathname === '/api/events') {
    const parsed = parseEventRequest(await request.json().catch(() => null));
    if (!parsed.ok) return problem(400, parsed.error);

    const { input, idempotencyKey } = buildNotification(
      parsed.event,
      parsed.order,
      parsed.customer,
      env.STORE_NAME,
    );
    try {
      const created = await notifyhub.notifications.create(input, { idempotencyKey });
      return Response.json(
        {
          event: parsed.event,
          label: TEMPLATES[parsed.event].label,
          idempotencyKey,
          message: input.message,
          notification: created,
        },
        { status: 202 },
      );
    } catch (error) {
      return fromNotifyHub(error);
    }
  }

  const match = /^\/api\/notifications\/([^/]+)$/.exec(url.pathname);
  if (request.method === 'GET' && match?.[1]) {
    if (!UUID.test(match[1])) return problem(400, 'id inválido');
    try {
      return Response.json(await notifyhub.notifications.get(match[1]));
    } catch (error) {
      return fromNotifyHub(error);
    }
  }

  return problem(404, 'no encontrado');
}
