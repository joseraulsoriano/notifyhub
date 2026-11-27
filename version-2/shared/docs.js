const express = require("express");
const fs = require("node:fs");

const CDN = "https://cdn.jsdelivr.net";
// Solo este CDN y el propio origen; Swagger UI necesita estilos inline.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CDN}`,
  `style-src 'self' 'unsafe-inline' ${CDN}`,
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TaskFlow API</title>
  <link rel="stylesheet" href="${CDN}/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN}/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/openapi.yaml', dom_id: '#swagger-ui', deepLinking: true });
  </script>
</body>
</html>`;

/** Router público con Swagger UI (`/docs`) y la especificación (`/openapi.yaml`, leída una vez al arrancar). */
function docsRouter({ specPath }) {
  const spec = fs.readFileSync(specPath, "utf8");
  const router = express.Router();
  router.get("/docs", (_req, res) => {
    res.set("content-security-policy", CSP);
    res.type("html").send(html);
  });
  router.get("/openapi.yaml", (_req, res) => {
    res.set("content-type", "application/yaml; charset=utf-8");
    res.send(spec);
  });
  return router;
}

module.exports = { docsRouter, CSP };
