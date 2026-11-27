function actorFromRequest(req) {
  return {
    id: req.get("x-user-id"),
    role: req.get("x-user-role"),
    jti: req.get("x-token-id"),
    expiresAt: Number(req.get("x-token-expires-at")),
  };
}

function requireActor(req) {
  const actor = actorFromRequest(req);
  if (!actor.id || !actor.role || !actor.jti) {
    const error = new Error("authentication_required");
    error.status = 401;
    throw error;
  }
  return actor;
}

module.exports = { actorFromRequest, requireActor };
