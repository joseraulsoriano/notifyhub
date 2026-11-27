const express = require("express");
const { internalToken, requireInternal } = require("./internal-auth");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createApp(serviceName) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok", service: serviceName }));
  internalToken(); // falla al arrancar si falta el secreto
  app.use(requireInternal);
  return app;
}

function listen(app, serviceName) {
  app.use((error, _req, res, _next) => {
    console.error(`${serviceName} request failed`, error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
      error: status === 500 ? "internal_error" : error.message,
    });
  });
  const port = Number(process.env.PORT || 8080);
  app.listen(port, "0.0.0.0", () => console.log(`${serviceName} listening on ${port}`));
}

module.exports = { HttpError, asyncRoute, createApp, listen };
