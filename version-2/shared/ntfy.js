// Notificaciones push al celular vía ntfy (https://ntfy.sh). Funciones puras y testeables.
// Minimización de datos: a ntfy solo viaja el título de la tarea y su estado (nunca correos ni nombres).

// Render no tiene salida IPv6: sin esto, la conexión a ntfy.sh se queda esperando una dirección AAAA y vence.
require("node:dns").setDefaultResultOrder("ipv4first");

const TOPIC_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
const DEFAULT_SERVER = "https://ntfy.sh";
const TIMEOUT_MS = 8000;

const STATUS_LABEL = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completada",
};

function ntfyServer() {
  return (process.env.NTFY_SERVER || DEFAULT_SERVER).replace(/\/+$/, "");
}

function isValidTopic(topic) {
  return typeof topic === "string" && TOPIC_PATTERN.test(topic);
}

function buildPush(eventType, task) {
  const title = typeof task?.title === "string" && task.title.trim() ? task.title.trim().slice(0, 200) : "una tarea";
  const status = STATUS_LABEL[task?.status] || "otro estado";
  if (eventType === "task_assigned") {
    return { title: "Te asignaron una tarea", message: `${title} (${status})`, tags: ["clipboard"] };
  }
  return { title: "Cambió el estado de una tarea", message: `${title}: ${status}`, tags: ["arrows_counterclockwise"] };
}

// Usa el endpoint JSON de ntfy (POST a la raíz) para que los acentos no dependan de cabeceras HTTP.
async function sendPush({ server = ntfyServer(), topic, title, message, tags, click }, fetchImpl = fetch) {
  if (!isValidTopic(topic)) throw new Error("invalid_topic");
  const response = await fetchImpl(`${server.replace(/\/+$/, "")}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title, message, ...(tags ? { tags } : {}), ...(click ? { click } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ntfy_http_${response.status}`);
}

module.exports = { buildPush, isValidTopic, ntfyServer, sendPush, DEFAULT_SERVER };
