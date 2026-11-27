const { randomUUID } = require("node:crypto");
const { pool } = require("../../shared/db");
const { asyncRoute, createApp, HttpError, listen } = require("../../shared/http");
const { createRedisClient, connect } = require("../../shared/redis");
const { requireActor } = require("../../shared/identity");
const { buildPush, isValidTopic, ntfyServer, sendPush } = require("../../shared/ntfy");

const app = createApp("notification-service");
const subscriber = createRedisClient();
const clients = new Map();

app.get(
  "/stream",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ userId: actor.id })}\n\n`);
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25000);
    if (!clients.has(actor.id)) clients.set(actor.id, new Set());
    clients.get(actor.id).add(res);
    res.on("close", () => {
      clearInterval(heartbeat);
      const connections = clients.get(actor.id);
      connections?.delete(res);
      if (connections?.size === 0) clients.delete(actor.id);
    });
  }),
);

// Push al celular vía ntfy. Van antes de cualquier ruta paramétrica.
app.get(
  "/push",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { rows } = await pool.query("SELECT topic FROM notifications.push_targets WHERE user_id = $1", [actor.id]);
    res.json({ topic: rows[0]?.topic ?? null, server: ntfyServer() });
  }),
);

app.put(
  "/push",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const topic = req.body?.topic;
    if (!isValidTopic(topic)) throw new HttpError(400, "invalid_topic");
    await pool.query(
      `INSERT INTO notifications.push_targets (user_id, topic) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET topic = EXCLUDED.topic`,
      [actor.id, topic],
    );
    res.json({ topic });
  }),
);

app.delete(
  "/push",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const result = await pool.query("DELETE FROM notifications.push_targets WHERE user_id = $1", [actor.id]);
    res.json({ removed: result.rowCount > 0 });
  }),
);

app.post(
  "/push/test",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { rows } = await pool.query("SELECT topic FROM notifications.push_targets WHERE user_id = $1", [actor.id]);
    if (!rows[0]) throw new HttpError(404, "push_not_configured");
    try {
      await sendPush({
        server: ntfyServer(),
        topic: rows[0].topic,
        title: "Prueba de TaskFlow",
        message: "Las notificaciones en tu celular funcionan.",
        tags: ["white_check_mark"],
      });
    } catch (error) {
      console.error("ntfy test push failed:", error.name, error.message);
      throw new HttpError(502, "push_failed");
    }
    res.json({ sent: true });
  }),
);

app.get(
  "/",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const { rows } = await pool.query(
      `SELECT id, event_id, task_id, event_type, payload, read_at, created_at
       FROM notifications.items WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [actor.id, limit],
    );
    res.json({ notifications: rows });
  }),
);

app.patch(
  "/:notificationId/read",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { rows } = await pool.query(
      `UPDATE notifications.items SET read_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, event_id, task_id, event_type, payload, read_at, created_at`,
      [req.params.notificationId, actor.id],
    );
    if (!rows[0]) throw new HttpError(404, "notification_not_found");
    res.json({ notification: rows[0] });
  }),
);

// Un fallo de ntfy nunca debe romper el manejo del evento ni el SSE: se captura y se registra sin datos personales.
async function pushToPhone(userId, event) {
  try {
    const { rows } = await pool.query("SELECT topic FROM notifications.push_targets WHERE user_id = $1", [userId]);
    if (!rows[0]) return;
    await sendPush({ server: ntfyServer(), topic: rows[0].topic, ...buildPush(event.eventType, event.task) });
  } catch (error) {
    console.error("ntfy push failed:", error.name, error.message);
  }
}

async function handleTaskEvent(message) {
  let event;
  try {
    event = JSON.parse(message);
  } catch (error) {
    console.error("Ignoring malformed task event", error);
    return;
  }
  if (
    typeof event.eventId !== "string" ||
    typeof event.taskId !== "string" ||
    typeof event.eventType !== "string" ||
    !Array.isArray(event.recipients)
  ) {
    console.error("Ignoring invalid task event", event);
    return;
  }
  for (const userId of new Set(event.recipients)) {
    if (typeof userId !== "string") continue;
    const notification = {
      id: randomUUID(),
      eventId: event.eventId,
      taskId: event.taskId,
      eventType: event.eventType,
      payload: event,
      createdAt: event.occurredAt || new Date().toISOString(),
    };
    const { rows } = await pool.query(
      `INSERT INTO notifications.items (id, event_id, user_id, task_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id, user_id) DO NOTHING
       RETURNING id, event_id, user_id, task_id, event_type, payload, read_at, created_at`,
      [
        notification.id,
        notification.eventId,
        userId,
        notification.taskId,
        notification.eventType,
        notification.payload,
        notification.createdAt,
      ],
    );
    const saved = rows[0];
    if (!saved) continue;
    for (const connection of clients.get(userId) || []) {
      connection.write(`id: ${saved.id}\nevent: notification\ndata: ${JSON.stringify(saved)}\n\n`);
    }
    await pushToPhone(userId, event);
  }
}

async function initialize() {
  await pool.query("CREATE SCHEMA IF NOT EXISTS notifications");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications.items (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      task_id UUID NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications.push_targets (
      user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS notification_user_created_idx ON notifications.items (user_id, created_at DESC)");
}

async function start() {
  await connect(subscriber);
  await initialize();
  await subscriber.subscribe("task-events", (message) => {
    handleTaskEvent(message).catch((error) => console.error("Failed to persist task event", error));
  });
  listen(app, "notification-service");
}

start().catch((error) => {
  console.error("notification-service failed to start", error);
  process.exitCode = 1;
});
