import { InMemoryClientAppRepository, InMemoryRateLimiter } from '@notifyhub/application';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

/** Rutas reales de /v1 que el contrato OpenAPI debe describir. */
const V1_PATHS = [
  '/v1/notifications',
  '/v1/notifications/{id}',
  '/v1/providers',
  '/v1/providers/{code}',
  '/v1/audit-log',
  '/v1/dispatch/capacity',
  '/v1/subscriptions',
  '/v1/subscriptions/{id}',
];

describe('documentación pública (Swagger UI y OpenAPI)', () => {
  // `open` no debe invocarse en las rutas públicas: si se llamara, la prueba fallaría.
  const app = createApp(async () => {
    const clients = new InMemoryClientAppRepository();
    return {
      deps: {
        config: { RATE_LIMIT_WINDOW_SECONDS: 60, PROVIDER_ADMIN_CLIENTS: '' },
        clients,
        limiter: new InMemoryRateLimiter(),
      } as never,
    };
  });

  it('GET /docs sirve Swagger UI sin API key y con CSP', async () => {
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://cdn.jsdelivr.net');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    const html = await res.text();
    expect(html).toContain('/openapi.yaml');
    expect(html).toContain('<title>NotifyHub API</title>');
    expect(html).toContain('swagger-ui-dist@5');
  });

  it('GET /openapi.yaml sirve el contrato con todas las rutas /v1 reales', async () => {
    const res = await app.request('/openapi.yaml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/yaml; charset=utf-8');
    const yaml = await res.text();
    expect(yaml).toContain('openapi:');
    for (const path of V1_PATHS) expect(yaml).toContain(`\n  ${path}:\n`);
  });

  it('todas las rutas /v1 registradas en la app están en el contrato', async () => {
    const yaml = await (await app.request('/openapi.yaml')).text();
    const registered = new Set(
      app.routes
        .filter((r) => r.method !== 'ALL' && r.path.startsWith('/v1/'))
        .map((r) => r.path.replace(/:(\w+)/g, '{$1}')),
    );
    expect([...registered].sort()).toEqual([...V1_PATHS].sort());
    for (const path of registered) expect(yaml).toContain(`\n  ${path}:\n`);
  });

  it('/v1 sigue exigiendo API key', async () => {
    const res = await app.request('/v1/notifications');
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });
});
