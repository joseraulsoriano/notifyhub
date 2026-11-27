const { randomUUID } = require("node:crypto");
const { pool } = require("../../shared/db");
const { required } = require("../../shared/config");
const { HttpError, asyncRoute, createApp, listen } = require("../../shared/http");
const { createRedisClient, connect } = require("../../shared/redis");
const { requireActor } = require("../../shared/identity");
const {
  TASK_STATUSES,
  canAssignTo,
  canChangeTaskStatus,
  canViewProject,
  isProjectManager,
} = require("../../shared/access-control");

const app = createApp("task-service");
const redis = createRedisClient();
const cacheTtl = 60;
required("JWT_SECRET");

async function projectForUser(projectId, actor) {
  const { rows } = await pool.query(
    "SELECT id, name, description, leader_id, created_at FROM tasks.projects WHERE id = $1",
    [projectId],
  );
  const project = rows[0];
  if (!project) throw new HttpError(404, "project_not_found");
  const members = await pool.query(
    "SELECT user_id FROM tasks.project_members WHERE project_id = $1",
    [projectId],
  );
  const memberIds = members.rows.map((row) => row.user_id);
  if (!canViewProject(actor, project, memberIds)) throw new HttpError(403, "project_access_denied");
  return { project, memberIds };
}

async function userExists(userId) {
  if (!userId) return false;
  const { rows } = await pool.query("SELECT id FROM auth.users WHERE id = $1", [userId]);
  return Boolean(rows[0]);
}

async function publishTaskEvent(eventType, task, recipientIds, actorId) {
  const recipients = [...new Set(recipientIds.filter((id) => id && id !== actorId))];
  if (recipients.length === 0) return;
  await redis.publish(
    "task-events",
    JSON.stringify({
      eventId: randomUUID(),
      eventType,
      taskId: task.id,
      projectId: task.project_id,
      actorId,
      recipients,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        assigneeId: task.assignee_id,
      },
      occurredAt: new Date().toISOString(),
    }),
  );
}

async function invalidateTaskCache(projectId, taskId) {
  await redis.del(`tasks:project:${projectId}`, `tasks:item:${taskId}`);
}

app.get(
  "/projects",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const query =
      actor.role === "admin"
        ? "SELECT id, name, description, leader_id, created_at FROM tasks.projects ORDER BY created_at DESC"
        : `SELECT DISTINCT p.id, p.name, p.description, p.leader_id, p.created_at
           FROM tasks.projects p
           LEFT JOIN tasks.project_members m ON m.project_id = p.id
           WHERE p.leader_id = $1 OR m.user_id = $1
           ORDER BY p.created_at DESC`;
    const { rows } = await pool.query(query, actor.role === "admin" ? [] : [actor.id]);
    res.json({ projects: rows });
  }),
);

app.post(
  "/projects",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { name, description = "", members = [] } = req.body || {};
    if (typeof name !== "string" || !name.trim() || typeof description !== "string") {
      throw new HttpError(400, "project_name_required");
    }
    if (!Array.isArray(members) || members.some((id) => typeof id !== "string")) {
      throw new HttpError(400, "members_must_be_user_ids");
    }
    const client = await pool.connect();
    let project;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "INSERT INTO tasks.projects (name, description, leader_id) VALUES ($1, $2, $3) RETURNING *",
        [name.trim(), description, actor.id],
      );
      project = result.rows[0];
      const uniqueMembers = [...new Set(members)].filter((id) => id !== actor.id);
      if (uniqueMembers.length) {
        const found = await client.query(
          "SELECT id FROM auth.users WHERE id = ANY($1::uuid[])",
          [uniqueMembers],
        );
        if (found.rowCount !== uniqueMembers.length) throw new HttpError(400, "unknown_project_member");
        await client.query(
          "INSERT INTO tasks.project_members (project_id, user_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING",
          [project.id, uniqueMembers],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ project });
  }),
);

app.get(
  "/projects/:projectId/members",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { project } = await projectForUser(req.params.projectId, actor);
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.role, (u.id = $2) AS is_leader
       FROM auth.users u
       WHERE u.id = $2 OR u.id IN (SELECT user_id FROM tasks.project_members WHERE project_id = $1)
       ORDER BY is_leader DESC, u.name ASC`,
      [project.id, project.leader_id],
    );
    res.json({ members: rows });
  }),
);

app.post(
  "/projects/:projectId/members",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { project } = await projectForUser(req.params.projectId, actor);
    if (!isProjectManager(actor, project)) throw new HttpError(403, "project_leader_or_admin_required");
    const { userId } = req.body || {};
    if (!(await userExists(userId))) throw new HttpError(404, "user_not_found");
    await pool.query(
      "INSERT INTO tasks.project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [project.id, userId],
    );
    res.status(201).json({ projectId: project.id, userId });
  }),
);

app.get(
  "/projects/:projectId/tasks",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    await projectForUser(req.params.projectId, actor);
    const key = `tasks:project:${req.params.projectId}`;
    const cached = await redis.get(key);
    if (cached) return res.json({ tasks: JSON.parse(cached), source: "cache" });
    const { rows } = await pool.query(
      "SELECT * FROM tasks.items WHERE project_id = $1 ORDER BY created_at DESC",
      [req.params.projectId],
    );
    await redis.set(key, JSON.stringify(rows), { EX: cacheTtl });
    res.json({ tasks: rows, source: "database" });
  }),
);

app.get(
  "/tasks/:taskId",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const key = `tasks:item:${req.params.taskId}`;
    const cached = await redis.get(key);
    if (cached) {
      const task = JSON.parse(cached);
      await projectForUser(task.project_id, actor);
      return res.json({ task, source: "cache" });
    }
    const { rows } = await pool.query("SELECT * FROM tasks.items WHERE id = $1", [req.params.taskId]);
    const task = rows[0];
    if (!task) throw new HttpError(404, "task_not_found");
    await projectForUser(task.project_id, actor);
    await redis.set(key, JSON.stringify(task), { EX: cacheTtl });
    res.json({ task, source: "database" });
  }),
);

app.post(
  "/projects/:projectId/tasks",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { project, memberIds } = await projectForUser(req.params.projectId, actor);
    const { title, description = "", assigneeId = null } = req.body || {};
    if (typeof title !== "string" || !title.trim() || typeof description !== "string") {
      throw new HttpError(400, "task_title_required");
    }
    if (assigneeId !== null) {
      if (!(await userExists(assigneeId))) throw new HttpError(404, "user_not_found");
      if (!memberIds.includes(assigneeId) && assigneeId !== project.leader_id) {
        throw new HttpError(400, "assignee_must_be_project_member");
      }
      if (!canAssignTo(actor, project, assigneeId)) throw new HttpError(403, "project_leader_or_admin_required_to_assign");
    }
    const { rows } = await pool.query(
      `INSERT INTO tasks.items (project_id, title, description, assignee_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [project.id, title.trim(), description, assigneeId, actor.id],
    );
    const task = rows[0];
    await redis.del(`tasks:project:${project.id}`);
    if (assigneeId) await publishTaskEvent("task_assigned", task, [assigneeId], actor.id);
    res.status(201).json({ task });
  }),
);

app.patch(
  "/tasks/:taskId/assignee",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { assigneeId } = req.body || {};
    if (assigneeId !== null && typeof assigneeId !== "string") {
      throw new HttpError(400, "assignee_id_must_be_user_id_or_null");
    }
    const { rows: taskRows } = await pool.query("SELECT * FROM tasks.items WHERE id = $1", [req.params.taskId]);
    const task = taskRows[0];
    if (!task) throw new HttpError(404, "task_not_found");
    const { project, memberIds } = await projectForUser(task.project_id, actor);
    if (!canAssignTo(actor, project, assigneeId, task.assignee_id)) {
      throw new HttpError(403, "project_leader_or_admin_required_to_assign");
    }
    if (assigneeId !== null) {
      if (!(await userExists(assigneeId))) throw new HttpError(404, "user_not_found");
      if (!memberIds.includes(assigneeId) && assigneeId !== project.leader_id) {
        throw new HttpError(400, "assignee_must_be_project_member");
      }
    }
    const { rows } = await pool.query(
      "UPDATE tasks.items SET assignee_id = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [assigneeId, task.id],
    );
    const updated = rows[0];
    await invalidateTaskCache(task.project_id, task.id);
    await publishTaskEvent(
      assigneeId ? "task_assigned" : "task_unassigned",
      updated,
      [assigneeId, task.assignee_id, project.leader_id],
      actor.id,
    );
    res.json({ task: updated });
  }),
);

app.patch(
  "/tasks/:taskId/status",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { status } = req.body || {};
    if (!TASK_STATUSES.has(status)) throw new HttpError(400, "invalid_task_status");
    const { rows: taskRows } = await pool.query("SELECT * FROM tasks.items WHERE id = $1", [req.params.taskId]);
    const task = taskRows[0];
    if (!task) throw new HttpError(404, "task_not_found");
    const { project } = await projectForUser(task.project_id, actor);
    if (!canChangeTaskStatus(actor, task)) throw new HttpError(403, "assigned_member_required");
    const { rows } = await pool.query(
      "UPDATE tasks.items SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [status, task.id],
    );
    const updated = rows[0];
    await invalidateTaskCache(task.project_id, task.id);
    await publishTaskEvent(
      "task_status_changed",
      updated,
      [updated.assignee_id, project.leader_id],
      actor.id,
    );
    res.json({ task: updated });
  }),
);

async function initialize() {
  await pool.query("CREATE SCHEMA IF NOT EXISTS tasks");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks.projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      leader_id UUID NOT NULL REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks.project_members (
      project_id UUID NOT NULL REFERENCES tasks.projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks.items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES tasks.projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed')),
      assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      created_by UUID NOT NULL REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS task_items_project_created_idx ON tasks.items (project_id, created_at DESC)");
}

async function start() {
  await connect(redis);
  await initialize();
  listen(app, "task-service");
}

start().catch((error) => {
  console.error("task-service failed to start", error);
  process.exitCode = 1;
});
