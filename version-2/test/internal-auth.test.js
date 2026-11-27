const test = require("node:test");
const assert = require("node:assert/strict");

process.env.INTERNAL_TOKEN = "t".repeat(40);
const { requireInternal, internalHeaders } = require("../shared/internal-auth");
const { cors, parseOrigins } = require("../shared/cors");

const run = (middleware, headers = {}, method = "GET") => {
  const out = { status: null, headers: {}, nextCalled: false };
  const req = { method, get: (name) => headers[name.toLowerCase()] };
  const res = {
    set: (k, v) => ((out.headers[k] = v), res),
    status: (s) => ((out.status = s), res),
    json: () => res,
    end: () => res,
  };
  middleware(req, res, () => (out.nextCalled = true));
  return out;
};

test("un servicio rechaza llamadas sin el token interno (identidad falsificada)", () => {
  const forged = run(requireInternal, { "x-user-id": "1", "x-user-role": "admin" });
  assert.equal(forged.status, 401);
  assert.equal(forged.nextCalled, false);
  assert.equal(run(requireInternal, { "x-internal-token": "x".repeat(40) }).status, 401);
  assert.equal(run(requireInternal, { "x-internal-token": "corto" }).status, 401);
});

test("acepta el token que firma el gateway", () => {
  const ok = run(requireInternal, { "x-internal-token": internalHeaders()["x-internal-token"] });
  assert.equal(ok.nextCalled, true);
});

test("exige un secreto de al menos 32 caracteres", () => {
  const previous = process.env.INTERNAL_TOKEN;
  process.env.INTERNAL_TOKEN = "corto";
  assert.throws(() => internalHeaders(), /32 characters/);
  process.env.INTERNAL_TOKEN = previous;
});

test("CORS solo para orígenes de la lista", () => {
  const mw = cors(parseOrigins("https://a.test/, https://b.test"));
  const allowed = run(mw, { origin: "https://a.test" });
  assert.equal(allowed.headers["access-control-allow-origin"], "https://a.test");
  assert.equal(allowed.nextCalled, true);
  const denied = run(mw, { origin: "https://evil.test" });
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
  assert.equal(run(mw, { origin: "https://a.test" }, "OPTIONS").status, 204);
  assert.equal(run(mw, { origin: "https://evil.test" }, "OPTIONS").status, 403);
  assert.deepEqual(parseOrigins(""), []);
});
