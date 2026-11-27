const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPush, isValidTopic, sendPush } = require("../shared/ntfy");

test("buildPush para task_assigned", () => {
  const push = buildPush("task_assigned", { title: "Revisar informe", status: "pending" });
  assert.equal(push.title, "Te asignaron una tarea");
  assert.equal(push.message, "Revisar informe (Pendiente)");
  assert.ok(Array.isArray(push.tags));
});

test("buildPush para task_status_changed", () => {
  const push = buildPush("task_status_changed", { title: "Revisar informe", status: "completed" });
  assert.equal(push.title, "Cambió el estado de una tarea");
  assert.equal(push.message, "Revisar informe: Completada");
});

test("isValidTopic acepta y rechaza", () => {
  assert.ok(isValidTopic("taskflow-abcdefgh12345678"));
  assert.ok(isValidTopic("a".repeat(12)));
  assert.ok(isValidTopic("A_b-".repeat(16)));
  for (const bad of ["corto", "a".repeat(65), "tiene espacios aqui", "acentó-acentó-1234", "a/b/c/d/e/f/g/h/i", "", null, 42])
    assert.equal(isValidTopic(bad), false, String(bad));
});

test("sendPush publica JSON sin datos personales", async () => {
  let call;
  const fake = async (url, init) => {
    call = { url, init };
    return { ok: true, status: 200 };
  };
  const push = buildPush("task_assigned", { title: "Tarea", status: "pending", assigneeId: "x", email: "a@b.com" });
  await sendPush({ server: "https://ntfy.example", topic: "taskflow-abcdefgh12345678", ...push }, fake);
  assert.equal(call.url, "https://ntfy.example/");
  assert.equal(call.init.method, "POST");
  assert.ok(call.init.signal instanceof AbortSignal);
  const body = JSON.parse(call.init.body);
  assert.equal(body.topic, "taskflow-abcdefgh12345678");
  assert.ok(!call.init.body.includes("@"), "el payload no contiene correos");
});

test("sendPush lanza con error HTTP", async () => {
  await assert.rejects(
    sendPush({ topic: "taskflow-abcdefgh12345678", title: "t", message: "m" }, async () => ({ ok: false, status: 500 })),
    /ntfy_http_500/,
  );
});

test("sendPush lanza si vence el tiempo", async () => {
  const fake = async () => {
    throw new DOMException("timeout", "TimeoutError");
  };
  await assert.rejects(sendPush({ topic: "taskflow-abcdefgh12345678", title: "t", message: "m" }, fake), /timeout/);
});

test("sendPush rechaza un tema inválido sin llamar a la red", async () => {
  await assert.rejects(sendPush({ topic: "x", title: "t", message: "m" }, async () => assert.fail("no debe llamar")), /invalid_topic/);
});
