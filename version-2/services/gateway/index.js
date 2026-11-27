const express = require("express");
const jwt = require("jsonwebtoken");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { required } = require("../../shared/config");
const { createRedisClient, connect } = require("../../shared/redis");
const { internalHeaders, internalToken } = require("../../shared/internal-auth");
const { cors, parseOrigins } = require("../../shared/cors");

/** Render entrega `host:puerto` de la red privada; docker-compose entrega la URL completa. */
const baseUrl = (value) => (/^https?:\/\//.test(value || "") ? value : `http://${value}`);
const AUTH_URL = baseUrl(process.env.AUTH_URL);
const TASK_URL = baseUrl(process.env.TASK_URL);
const NOTIFICATION_URL = baseUrl(process.env.NOTIFICATION_URL);
const PRESENCE_URL = baseUrl(process.env.PRESENCE_URL);

const app = express();
const redis = createRedisClient();
const jwtSecret = required("JWT_SECRET");
internalToken();
app.use(cors(parseOrigins(process.env.CORS_ORIGINS)));
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "api-gateway" }));

function isPublic(req) {
  return req.method === "POST" && ["/api/auth/register", "/api/auth/login"].includes(req.path);
}

app.use(async (req, res, next) => {
  if (isPublic(req)) return next();
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "authentication_required" });
  try {
    const claims = jwt.verify(match[1], jwtSecret, { issuer: "taskflow-v2" });
    if (
      typeof claims.sub !== "string" ||
      typeof claims.jti !== "string" ||
      !["admin", "leader", "member"].includes(claims.role)
    ) {
      return res.status(401).json({ error: "invalid_token" });
    }
    if (await redis.exists(`auth:revoked:${claims.jti}`)) {
      return res.status(401).json({ error: "token_revoked" });
    }
    if (!(await redis.exists(`auth:session:${claims.jti}`))) {
      return res.status(401).json({ error: "session_expired" });
    }
    req.auth = claims;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "invalid_token" });
    }
    next(error);
  }
});

function headersFor(req) {
  const headers = { ...internalHeaders() };
  const accept = req.get("accept");
  if (accept) headers.accept = accept;
  const contentType = req.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  if (req.auth) {
    headers["x-user-id"] = req.auth.sub;
    headers["x-user-role"] = req.auth.role;
    headers["x-token-id"] = req.auth.jti;
    headers["x-token-expires-at"] = String(req.auth.exp);
  }
  return headers;
}

async function callPresence(path, method, auth) {
  const response = await fetch(`${PRESENCE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...internalHeaders(),
      "x-user-id": auth.sub,
      "x-user-role": auth.role,
      "x-token-id": auth.jti,
      "x-token-expires-at": String(auth.exp),
    },
    ...(method === "POST" ? { body: JSON.stringify({ jti: auth.jti }) } : {}),
  });
  if (!response.ok) throw new Error(`presence-service returned ${response.status}`);
}

function proxy(prefix, target, servicePath = "") {
  app.use(prefix, async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      const path = `${servicePath}${req.originalUrl.slice(prefix.length) || "/"}`;
      const hasBody = !["GET", "HEAD"].includes(req.method) && req.body !== undefined;
      const response = await fetch(`${target}${path}`, {
        method: req.method,
        headers: headersFor(req),
        signal: controller.signal,
        ...(hasBody ? { body: JSON.stringify(req.body) } : {}),
      });

      const contentType = response.headers.get("content-type") || "";
      res.status(response.status);
      if (contentType) res.set("content-type", contentType);
      for (const header of ["cache-control", "retry-after"]) {
        const value = response.headers.get(header);
        if (value) res.set(header, value);
      }

      if (contentType.includes("text/event-stream") && response.body) {
        pipeline(Readable.fromWeb(response.body), res).catch((error) => {
          if (controller.signal.aborted || error.name === "AbortError") return;
          console.error("API gateway stream failed", error);
          if (!res.headersSent) res.status(502).json({ error: "upstream_unavailable" });
          else res.destroy(error);
        });
        return;
      }

      const body = await response.text();
      if (prefix === "/api/auth" && req.path === "/login" && response.ok) {
        const payload = JSON.parse(body);
        const claims = jwt.verify(payload.accessToken, jwtSecret, { issuer: "taskflow-v2" });
        await callPresence("/sessions", "POST", claims);
      }
      if (prefix === "/api/auth" && req.path === "/logout" && response.ok) {
        await callPresence(`/sessions/${encodeURIComponent(req.auth.jti)}`, "DELETE", req.auth);
      }
      res.send(body);
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("API gateway upstream request failed", error);
      if (!res.headersSent) res.status(502).json({ error: "upstream_unavailable" });
      else res.end();
    }
  });
}

proxy("/api/auth", AUTH_URL);
proxy("/api/projects", TASK_URL, "/projects");
proxy("/api/tasks", TASK_URL, "/tasks");
proxy("/api/notifications", NOTIFICATION_URL);
proxy("/api/presence", PRESENCE_URL);

app.use((error, _req, res, _next) => {
  console.error("API gateway request failed", error);
  res.status(500).json({ error: "internal_error" });
});

async function start() {
  await connect(redis);
  const port = Number(process.env.PORT || 8080);
  app.listen(port, "0.0.0.0", () => console.log(`api-gateway listening on ${port}`));
}

start().catch((error) => {
  console.error("api-gateway failed to start", error);
  process.exitCode = 1;
});
