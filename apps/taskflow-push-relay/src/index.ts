import { sanitize, withinLimit } from './sanitize';

const NTFY = 'https://ntfy.sh/';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') return Response.json({ service: 'taskflow-push-relay', ok: true });
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });

    const text = await request.text();
    if (!withinLimit(new TextEncoder().encode(text).length))
      return Response.json({ error: 'too_large' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }
    const push = sanitize(body);
    if (!push) return Response.json({ error: 'invalid_push' }, { status: 400 });

    const response = await fetch(NTFY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(push),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!response?.ok) return Response.json({ error: 'ntfy_failed' }, { status: 502 });
    return Response.json({ sent: true });
  },
};
