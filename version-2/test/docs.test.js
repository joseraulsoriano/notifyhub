const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const { docsRouter } = require("../shared/docs");

test("docs publica Swagger UI y la especificación", async () => {
  const app = express();
  app.use(docsRouter({ specPath: path.join(__dirname, "../services/gateway/openapi.yaml") }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const docs = await fetch(`${base}/docs`);
    assert.equal(docs.status, 200);
    assert.match(docs.headers.get("content-type"), /text\/html/);
    assert.ok(docs.headers.get("content-security-policy"));
    const html = await docs.text();
    assert.ok(html.includes("/openapi.yaml"));
    assert.ok(html.includes("cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"));

    const spec = await fetch(`${base}/openapi.yaml`);
    assert.equal(spec.status, 200);
    assert.equal(spec.headers.get("content-type"), "application/yaml; charset=utf-8");
    const yaml = await spec.text();
    assert.match(yaml, /^openapi: 3\./m);
    for (const route of [
      "/api/auth/users:",
      "/api/projects/{projectId}/members:",
      "/health/services:",
      "/api/notifications/push:",
      "/api/notifications/push/test:",
    ]) {
      assert.ok(yaml.includes(`  ${route}`), `falta ${route}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
