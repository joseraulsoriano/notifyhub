/** CORS por lista de orígenes (`CORS_ORIGINS`, separados por coma). Sin lista no se habilita ningún origen. */
function parseOrigins(value) {
  return (value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function cors(origins) {
  const allowed = new Set(origins);
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin && allowed.has(origin)) {
      res.set("access-control-allow-origin", origin);
      res.set("vary", "Origin");
      res.set("access-control-allow-headers", "authorization, content-type, accept");
      res.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.set("access-control-max-age", "600");
    }
    if (req.method === "OPTIONS") return res.status(origin && allowed.has(origin) ? 204 : 403).end();
    next();
  };
}

module.exports = { cors, parseOrigins };
