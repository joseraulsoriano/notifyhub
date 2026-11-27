import { Client } from 'pg';

const MAX_BODY_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(['notification.status_changed', 'notification.attempted']);

interface WebhookEvent {
  id: string;
  type: string;
  notificationId: string;
}

function jsonResponse(status: number, body: Record<string, string>): Response {
  return Response.json(body, { status });
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function verifyWebhookSignature(
  secretHash: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const keyBytes = decodeHex(secretHash);
  const signatureBytes = decodeHex(signature.replace(/^sha256=/, ''));
  if (!keyBytes || !signatureBytes || !signature.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify',
  ]);
  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(body));
}

async function handleNotify(request: Request, env: Env): Promise<Response> {
  const subscriptionId = request.headers.get('X-NotifyHub-Subscription-Id');
  const signature = request.headers.get('X-Signature');
  if (!subscriptionId || !UUID.test(subscriptionId) || !signature) {
    return jsonResponse(400, { error: 'Faltan encabezados de firma válidos' });
  }

  const body = await readBody(request);
  if (body === null) return jsonResponse(413, { error: 'El evento supera el tamaño permitido' });

  let event: WebhookEvent;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('id' in parsed) ||
      typeof parsed.id !== 'string' ||
      !UUID.test(parsed.id) ||
      !('notificationId' in parsed) ||
      typeof parsed.notificationId !== 'string' ||
      !UUID.test(parsed.notificationId) ||
      !('type' in parsed) ||
      typeof parsed.type !== 'string' ||
      !EVENT_TYPES.has(parsed.type)
    ) {
      return jsonResponse(400, { error: 'El cuerpo no tiene un formato de evento reconocido' });
    }
    event = {
      id: parsed.id,
      type: parsed.type,
      notificationId: parsed.notificationId,
    };
  } catch {
    return jsonResponse(400, { error: 'El cuerpo debe ser JSON válido' });
  }

  const db = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    await db.connect();
    const { rows } = await db.query<{ secret_hash: string }>(
      `SELECT secret_hash FROM subscription WHERE id = $1 AND active = true`,
      [subscriptionId],
    );
    const secretHash = rows[0]?.secret_hash;
    if (!secretHash || !(await verifyWebhookSignature(secretHash, body, signature))) {
      return jsonResponse(401, { error: 'Firma inválida o suscripción inactiva' });
    }

    console.log(
      JSON.stringify({
        message: 'webhook.inbox.received',
        eventId: event.id,
        eventType: event.type,
        notificationId: event.notificationId,
        subscriptionId,
      }),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'webhook.inbox.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return jsonResponse(500, { error: 'No se pudo procesar el evento' });
  } finally {
    try {
      await db.end();
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'webhook.inbox.database_close_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ status: 'ok' });
    }
    if (url.pathname !== '/notify') return jsonResponse(404, { error: 'Ruta no encontrada' });
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Método no permitido' });
    return handleNotify(request, env);
  },
} satisfies ExportedHandler<Env>;
