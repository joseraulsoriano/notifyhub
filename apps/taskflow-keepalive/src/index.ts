/** Servicios de TaskFlow en Render que hay que mantener despiertos. Todos exponen un /health público. */
const TARGETS: Record<string, string> = {
  gateway: 'https://taskflow-gateway-y6dh.onrender.com/health',
  auth: 'https://taskflow-auth-r5qc.onrender.com/health',
  tasks: 'https://taskflow-tasks-blvu.onrender.com/health',
  notifications: 'https://taskflow-notifications-r9n0.onrender.com/health',
  presence: 'https://taskflow-presence.onrender.com/health',
};

async function ping(url: string) {
  const started = Date.now();
  try {
    // Un servicio dormido tarda hasta ~50 s en responder: se espera lo suficiente para despertarlo.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(55_000),
      headers: { 'user-agent': 'taskflow-keepalive' },
    });
    return { ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - started };
  }
}

async function pingAll() {
  const entries = await Promise.all(
    Object.entries(TARGETS).map(async ([name, url]) => [name, await ping(url)] as const),
  );
  return Object.fromEntries(entries);
}

export default {
  async scheduled(_event: unknown, _env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(pingAll().then((result) => console.log(JSON.stringify(result))));
  },
  async fetch() {
    return Response.json(await pingAll());
  },
};
