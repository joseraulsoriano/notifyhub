function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (name === "JWT_SECRET" && value.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  return value;
}

function port() {
  return Number(process.env.PORT || 8080);
}

module.exports = { port, required };
