const { createClient } = require("redis");

function createRedisClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (error) => console.error("Redis client error", error));
  return client;
}

async function connect(client) {
  await client.connect();
}

module.exports = { connect, createRedisClient };
