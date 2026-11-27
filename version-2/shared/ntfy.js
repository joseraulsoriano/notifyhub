// Notificaciones push al celular vía ntfy (https://ntfy.sh). Funciones puras y testeables.
// Minimización de datos: a ntfy solo viaja el título de la tarea y su estado (nunca correos ni nombres).

// Desde Render el apretón de manos TCP con ntfy.sh tarda más de los 250 ms por intento que Node 22 usa por defecto
// al probar sus 4 direcciones (2 IPv4 + 2 IPv6): todas vencían en 1 s con ETIMEDOUT. Se prefiere IPv4 y se da
// margen real a cada intento.
require("node:dns").setDefaultResultOrder("ipv4first");
require("node:net").setDefaultAutoSelectFamilyAttemptTimeout(5000);

const TOPIC_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
const DEFAULT_SERVER = "https://ntfy.sh";
const TIMEOUT_MS = 8000;

const STATUS_LABEL = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completada",
};

// Servidor al que se suscribe la app del celular (se muestra en la interfaz).
function ntfyServer() {
  return (process.env.NTFY_SERVER || DEFAULT_SERVER).replace(/\/+$/, "");
}

// A dónde publica este servicio. Render no logra conectarse a ntfy.sh (la conexión se cuelga), así que se pasa por un
// relevo en Cloudflare que reenvía a ntfy.sh. Con NTFY_PUBLISH_URL se puede apuntar a otro (o directo a ntfy.sh).
const DEFAULT_RELAY = "https://taskflow-push-relay.sc202357155.workers.dev";
function ntfyPublishUrl() {
  return (process.env.NTFY_PUBLISH_URL || DEFAULT_RELAY).replace(/\/+$/, "");
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
async function sendPush({ server = ntfyPublishUrl(), topic, title, message, tags, click }, fetchImpl = fetch) {
  if (!isValidTopic(topic)) throw new Error("invalid_topic");
  const response = await fetchImpl(`${server.replace(/\/+$/, "")}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title, message, ...(tags ? { tags } : {}), ...(click ? { click } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ntfy_http_${response.status}`);
}

module.exports = { buildPush, isValidTopic, ntfyServer, ntfyPublishUrl, sendPush, DEFAULT_SERVER };
