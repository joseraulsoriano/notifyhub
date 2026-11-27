const { timingSafeEqual } = require("node:crypto");

/**
 * Los servicios internos confían en la identidad que reenvía el gateway (`x-user-*`). Para que nadie pueda
 * hablarles directo y falsificarla (p. ej. si el host expone sus puertos), el gateway firma cada llamada con
 * un secreto compartido y los servicios rechazan lo que no lo trae.
 */
const HEADER = "x-internal-token";

function internalToken() {
  const value = process.env.INTERNAL_TOKEN;
  if (!value || value.length < 32) throw new Error("INTERNAL_TOKEN must contain at least 32 characters");
  return value;
}

function internalHeaders() {
  return { [HEADER]: internalToken() };
}

function requireInternal(req, res, next) {
  const received = Buffer.from(req.get(HEADER) || "");
  const expected = Buffer.from(internalToken());
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return res.status(401).json({ error: "internal_only" });
  }
  next();
}

module.exports = { HEADER, internalHeaders, internalToken, requireInternal };
