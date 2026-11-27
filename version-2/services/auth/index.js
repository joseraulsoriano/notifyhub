const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const { pool } = require("../../shared/db");
const { required } = require("../../shared/config");
const { HttpError, asyncRoute, createApp, listen } = require("../../shared/http");
const { createRedisClient, connect } = require("../../shared/redis");
const { requireActor } = require("../../shared/identity");
const { ROLES } = require("../../shared/access-control");

const app = createApp("auth-service");
const redis = createRedisClient();
const tokenTtl = Number(process.env.TOKEN_TTL_SECONDS || 900);
const jwtSecret = required("JWT_SECRET");

app.post(
  "/register",
  asyncRoute(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.includes("@") ||
      typeof password !== "string" ||
      password.length < 10
    ) {
      throw new HttpError(400, "name_email_and_password_min_10_required");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query(
        `INSERT INTO auth.users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'member')
         RETURNING id, name, email, role, created_at`,
        [name.trim(), email.trim().toLowerCase(), passwordHash],
      );
      res.status(201).json({ user: rows[0] });
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "email_already_registered");
      throw error;
    }
  }),
);

app.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      throw new HttpError(400, "email_and_password_required");
    }
    const { rows } = await pool.query(
      "SELECT id, name, email, role, password_hash FROM auth.users WHERE email = $1",
      [email.trim().toLowerCase()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, "invalid_credentials");
    }

    const jti = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + tokenTtl;
    const accessToken = jwt.sign(
      { sub: user.id, role: user.role, jti },
      jwtSecret,
      { expiresIn: tokenTtl, issuer: "taskflow-v2" },
    );
    await redis.set(
      `auth:session:${jti}`,
      JSON.stringify({ userId: user.id, expiresAt }),
      { EX: tokenTtl },
    );
    res.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: tokenTtl,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }),
);

app.get(
  "/me",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { rows } = await pool.query(
      "SELECT id, name, email, role, created_at FROM auth.users WHERE id = $1",
      [actor.id],
    );
    if (!rows[0]) throw new HttpError(404, "user_not_found");
    res.json({ user: rows[0] });
  }),
);

app.patch(
  "/users/:id/role",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    if (actor.role !== "admin") throw new HttpError(403, "admin_required");
    const { role } = req.body || {};
    if (!ROLES.has(role)) throw new HttpError(400, "invalid_role");
    const { rows } = await pool.query(
      "UPDATE auth.users SET role = $1 WHERE id = $2 RETURNING id, name, email, role",
      [role, req.params.id],
    );
    if (!rows[0]) throw new HttpError(404, "user_not_found");
    res.json({ user: rows[0] });
  }),
);

app.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const ttl = Math.max(1, actor.expiresAt - Math.floor(Date.now() / 1000));
    await redis.set(`auth:revoked:${actor.jti}`, "1", { EX: ttl });
    await redis.del(`auth:session:${actor.jti}`);
    res.json({ loggedOut: true });
  }),
);

async function initialize() {
  await pool.query("CREATE SCHEMA IF NOT EXISTS auth");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'leader', 'member')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if ((email && !password) || (!email && password)) {
    throw new Error("Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD");
  }
  if (email && password) {
    if (password.length < 10) throw new Error("Bootstrap admin password must have at least 10 characters");
    await pool.query(
      `INSERT INTO auth.users (name, email, password_hash, role)
       VALUES ('Administrator', $1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [email.trim().toLowerCase(), await bcrypt.hash(password, 12)],
    );
  }
}

async function start() {
  await connect(redis);
  await initialize();
  listen(app, "auth-service");
}

start().catch((error) => {
  console.error("auth-service failed to start", error);
  process.exitCode = 1;
});
