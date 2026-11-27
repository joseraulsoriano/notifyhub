const { createRedisClient, connect } = require("../../shared/redis");
const { asyncRoute, createApp, HttpError, listen } = require("../../shared/http");
const { requireActor } = require("../../shared/identity");

const app = createApp("presence-service");
const redis = createRedisClient();
const sessionTtl = Number(process.env.TOKEN_TTL_SECONDS || 900);

app.post(
  "/sessions",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const { jti } = req.body || {};
    if (typeof jti !== "string" || jti !== actor.jti) throw new HttpError(400, "invalid_session_id");
    await redis
      .multi()
      .sAdd(`presence:sessions:${actor.id}`, jti)
      .expire(`presence:sessions:${actor.id}`, sessionTtl)
      .set(`presence:session:${jti}`, actor.id, { EX: sessionTtl })
      .set(`presence:online:${actor.id}`, "1", { EX: sessionTtl })
      .exec();
    res.status(201).json({ userId: actor.id, online: true });
  }),
);

app.delete(
  "/sessions/:jti",
  asyncRoute(async (req, res) => {
    const actor = requireActor(req);
    const owner = await redis.get(`presence:session:${req.params.jti}`);
    if (owner && owner !== actor.id) throw new HttpError(403, "session_access_denied");
    await redis
      .multi()
      .sRem(`presence:sessions:${actor.id}`, req.params.jti)
      .del(`presence:session:${req.params.jti}`)
      .exec();
    const remaining = await redis.sCard(`presence:sessions:${actor.id}`);
    if (remaining === 0) {
      await redis
        .multi()
        .del(`presence:sessions:${actor.id}`)
        .del(`presence:online:${actor.id}`)
        .exec();
    }
    res.json({ loggedOut: true, online: remaining > 0 });
  }),
);

app.get(
  "/online/:userId",
  asyncRoute(async (req, res) => {
    requireActor(req);
    const online = (await redis.exists(`presence:online:${req.params.userId}`)) === 1;
    res.json({ userId: req.params.userId, online });
  }),
);

async function start() {
  await connect(redis);
  listen(app, "presence-service");
}

start().catch((error) => {
  console.error("presence-service failed to start", error);
  process.exitCode = 1;
});
