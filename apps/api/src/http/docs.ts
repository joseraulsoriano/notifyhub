import { Hono } from 'hono';
// Fuente única del contrato: docs/api/openapi.yaml. Wrangler lo incluye como texto (regla "Text" de
// wrangler.jsonc) y Vitest lo carga con el plugin de vitest.config.ts.
import openapiYaml from '../../../../docs/api/openapi.yaml';

const SWAGGER_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5';

/**
 * Solo el CDN de Swagger UI y el propio origen; Swagger UI necesita estilos en línea y `data:` para íconos.
 * El script de arranque va con un nonce por respuesta, así no hace falta `'unsafe-inline'` en scripts.
 */
const docsCsp = (nonce: string) =>
  [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
    `img-src 'self' data: https://cdn.jsdelivr.net`,
    `font-src 'self' https://cdn.jsdelivr.net`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

const docsHtml = (nonce: string) => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NotifyHub API</title>
    <link rel="stylesheet" href="${SWAGGER_CDN}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_CDN}/swagger-ui-bundle.js"></script>
    <script nonce="${nonce}">
      window.ui = SwaggerUIBundle({ url: '/openapi.yaml', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>
`;

/** Documentación pública: sin API key ni límite de tasa (se monta antes y fuera de `/v1`). */
export const docsRoutes = new Hono()
  .get('/docs', (c) => {
    const nonce = btoa(crypto.randomUUID());
    return c.html(docsHtml(nonce), 200, { 'Content-Security-Policy': docsCsp(nonce) });
  })
  .get('/openapi.yaml', (c) =>
    c.body(openapiYaml, 200, {
      'Content-Type': 'application/yaml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    }),
  );
