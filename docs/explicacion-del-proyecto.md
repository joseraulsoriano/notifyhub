# NotifyHub: cómo funciona el proyecto y su tienda de demostración

Resumen para explicar el proyecto: la tienda de demostración, las notificaciones asíncronas con cola, cómo se
detecta que un canal falla, las API keys, la base de datos y por qué corre en Cloudflare. Todo lo que se describe
aquí es lo que hace el código de la rama `main`; lo que no está hecho se marca como pendiente.

| Recurso              | Dirección                                           |
| -------------------- | --------------------------------------------------- |
| Tienda demo (Vercel) | <https://notifyhub-demo-store.vercel.app>           |
| Consola (Cloudflare) | <https://notifyhub-console.sc202357155.workers.dev> |
| API (Cloudflare)     | <https://notifyhub-api.sc202357155.workers.dev>     |
| Repositorio          | `github.com/joseraulsoriano/notifyhub`, rama `main` |

## 1. La tienda de demostración

Es una tienda en línea mínima que usa NotifyHub como su módulo de notificaciones. Cada evento de un pedido se
convierte en una solicitud `POST /v1/notifications` y el comprador recibe el aviso por el canal que eligió. El código
está en `apps/demo-store`.

**Qué se ve en la página**

- **Catálogo y carrito:** eliges productos.
- **Datos del comprador:** nombre, correo, teléfono en formato `+52…` y canal preferido (correo, SMS o push).
- **Pagar y confirmar pedido:** genera el primer aviso.
- **Pedido (back office):** botones para pago rechazado, marcar como enviado, marcar como entregado y repetir la
  confirmación.
- **Avisos enviados al comprador:** cada aviso con su estado en vivo, los intentos y si cambió de canal.

**Recorrido de un aviso**

```text
1. Navegador ──POST /api/events──▶ servidor de la tienda
2. Servidor de la tienda ──POST /v1/notifications──▶ API de NotifyHub ──▶ cola
3. Despachador ──▶ SendGrid / Twilio / FCM ──▶ comprador
4. Navegador ──GET /api/notifications/:id (cada 1-2 s)──▶ servidor de la tienda
```

| Evento             | Aviso             | Prioridad |
| ------------------ | ----------------- | --------- |
| `order.confirmed`  | Pedido confirmado | MEDIUM    |
| `payment.rejected` | Pago rechazado    | HIGH      |
| `order.shipped`    | Envío en camino   | MEDIUM    |
| `order.delivered`  | Pedido entregado  | LOW       |

- El servidor de la tienda valida el evento (`src/events.ts`, `src/app.ts`) y llama a NotifyHub con su API key. **La
  llave vive solo en el servidor**; el navegador nunca la ve.
- Se envían correo, teléfono y token de push juntos para que NotifyHub pueda cambiar de canal si el preferido falla.
- **Idempotency-Key = `<pedido>:<evento>`** (por ejemplo `PED-ABC123:order.confirmed`). Si la tienda reintenta,
  NotifyHub devuelve el aviso original en lugar de enviar otro.

**Guion de demostración**

- **Compra normal:** el aviso pasa de "Recibido" a "Entregado".
- **Fallback:** en la consola marca FCM como `DOWN` y compra eligiendo push. Tras 3 intentos con error 503, NotifyHub
  cambia a SMS. Al terminar, regresa FCM a `UP`.
- **Idempotencia:** "Repetir confirmación" devuelve el aviso original marcado "Duplicado evitado".
- **Trazabilidad:** "Ver en la bitácora" abre la consola filtrada por ese aviso, con la consola conectada con la llave
  de la tienda.

## 2. Notificaciones asíncronas con cola

La API no envía el mensaje: lo valida, lo guarda, lo encola y responde **`202 Accepted`** con el `id`. Un Worker
despachador lo entrega después.

```text
Tienda ──▶ API (valida, guarda en RECEIVED, encola → QUEUED) ──▶ 202 con el id
                         │
          Cloudflare Queues: notifications-high / -medium / -low
                         │
          Despachador (Worker consumidor) ──▶ proveedor ──▶ SENDING → SENT → DELIVERED
```

- **Colas por prioridad:** alta, media y baja. Un pico de avisos de prioridad baja no retrasa el "pago rechazado"
  (alta).
- **La tienda consulta el estado** cada 1-2 s: `QUEUED`, `SENDING`, `SENT`, `DELIVERED` (o `RETRYING`, `FALLBACK` y
  `FAILED` si algo falla).
- **Entrega "al menos una vez":** la cola puede entregar el mismo mensaje dos veces. Por eso el despachador descarta
  lo que ya terminó, retoma un envío abandonado si lleva 120 s sin avance y, si otro despacho tiene la notificación,
  devuelve el mensaje a la cola para intentarlo en 30 s. Al proveedor le pasa la llave `notificationId:proveedor`.

**¿Por qué encolar en lugar de enviar directo?**

- **Respuesta rápida:** la tienda no espera a SendGrid o Twilio; recibe el `202` al instante.
- **Reintentos fuera del cliente:** la espera entre intentos (500 ms, 1 s, 2 s…) y el cambio de canal ocurren en
  segundo plano.
- **Durabilidad:** la notificación se guarda antes de encolarse; si el despachador falla a la mitad, la cola vuelve a
  entregar el mensaje.
- **Control de carga:** límites de envíos simultáneos por proveedor (SendGrid 3, Twilio 2, FCM 5, webhook 2). La cola
  absorbe los picos.

El costo de la asincronía es que la tienda no sabe en el momento si el mensaje llegó; por eso existen los estados y la
consulta periódica. La comparación con las alternativas (asíncrono sin cola y síncrono) está en
[`docs/cola-y-cloudflare.md`](cola-y-cloudflare.md).

**Pendiente:** si falla el encolado, la notificación queda guardada en `RECEIVED` y no se pierde, pero todavía no hay
un barrido que la reintente sola.

**Dónde verlo en la consola**

| Página                               | Qué muestra                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Resumen (`/`)                        | Mapa de rutas por canal, actividad reciente y notificaciones en curso por prioridad. |
| Notificaciones (`/notificaciones`)   | Cada notificación con su estado actual y el detalle de sus intentos.                 |
| Bitácora (`/bitacora`)               | Historial de cambios de estado e intentos; se exporta a CSV.                         |
| Nueva solicitud (`/nueva`)           | Crear una notificación desde la consola.                                             |
| Proveedores y ruteo (`/proveedores`) | Salud de cada proveedor y reglas de ruteo.                                           |
| Suscripciones (`/suscripciones`)     | Alta y activación de suscripciones a eventos.                                        |

## 3. Cómo se sabe que un canal falla

NotifyHub no adivina: cada intento queda registrado y se interpreta (`dispatch-service.ts` y `base-sender.ts`).

| Respuesta del proveedor                   | Interpretación                                           |
| ----------------------------------------- | -------------------------------------------------------- |
| 2xx                                       | Éxito                                                    |
| 429 o 5xx                                 | Fallo reintentable                                       |
| Otro 4xx (por ejemplo, destinatario malo) | Fallo permanente                                         |
| Tiempo agotado (30 s) o error de red      | Fallo reintentable (`PROVIDER_TIMEOUT`, `NETWORK_ERROR`) |
| Datos incompletos para el canal           | Fallo permanente, sin llamar al proveedor                |

- **Reintento con espera creciente:** el estado pasa a `RETRYING`, espera y reintenta con el mismo proveedor, hasta 3
  intentos.
- **Fallback al agotarse:** primero otro proveedor del mismo canal (según la Strategy de costo, prioridad o
  disponibilidad), luego el siguiente canal de la cadena (por ejemplo, de push a SMS) si hay dato de contacto.
- **Si no queda nada:** estado `FAILED` con la razón "sin canales alternativos".
- **Auditoría:** cada intento guarda proveedor, canal, número, si fue fallback, código de error y latencia; cada
  cambio de estado se publica como evento (Observer).

**Proveedores simulados en la demo.** El comportamiento sale del campo `provider.health`: `UP` entrega, `DEGRADED`
falla la mitad de las veces y es lento, `DOWN` responde siempre 503.

**Límites actuales**

- La salud de un proveedor se cambia a mano: no hay revisiones automáticas.
- No hay circuit breaker por proveedor: cada notificación descubre la caída con sus 3 intentos.
- No hay cola de mensajes fallidos (dead-letter) para los que agotan sus reintentos en Queues.

## 4. Las API keys

No hay un contenedor por cliente. Hay **una sola base de datos** y cada cliente es una fila de la tabla `client_app`.

| Columna              | Función                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `id`, `name`         | Identifican al cliente (por ejemplo, "Tienda Demo (Vercel)").             |
| `api_key_hash`       | Hash SHA-256 de la llave, único. La llave nunca se guarda en claro.       |
| `rate_limit_per_min` | Solicitudes permitidas por minuto (600 por defecto; la tienda tiene 120). |
| `active`             | Permite revocar la llave sin borrar el cliente.                           |

- **Autenticación:** la API toma el encabezado `X-API-Key`, calcula su hash y busca la fila. Si no existe o no está
  activa, responde 401.
- **Límite por minuto:** lo lleva un **Durable Object** de Cloudflare por cliente; al pasarse, la API responde 429.
- **Aislamiento:** las notificaciones y suscripciones llevan `clientAppId`; cada llave solo ve lo suyo.
- **Del lado del cliente:** la tienda guarda la llave como secreto de Vercel (`NOTIFYHUB_API_KEY`); la consola la
  guarda en el `sessionStorage` de la pestaña.
- **Rotación:** como solo se guarda el hash, la llave original no se puede recuperar. `rotate-key.sh` genera una nueva
  y la imprime una sola vez.

Es un diseño de varios clientes en una sola base: más simple y barato que una base o un contenedor por cliente, pero
el aislamiento depende de que cada consulta filtre por `clientAppId`.

## 5. La base de datos

Una sola base **PostgreSQL** compartida por la API y el despachador. En producción está en **Neon**, y los Workers de
Cloudflare llegan a ella por **Hyperdrive**, que mantiene las conexiones abiertas. En local es un Postgres en Docker
(`pnpm infra:up`). Prisma define el esquema y las migraciones; en ejecución, los repositorios usan `pg` con SQL
directo.

| Grupo                        | Tablas                                                   | Función                                                                                               |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Clientes y configuración     | `client_app`, `provider`, `routing_rule`                 | Clientes con el hash de su llave; proveedores con costo, confiabilidad y salud; orden de proveedores. |
| Notificaciones               | `notification`, `delivery_attempt`, `audit_log`          | La solicitud y su estado; un registro por intento; la bitácora de cambios de estado.                  |
| Concurrencia                 | `provider_dispatch_lease`, `notification_dispatch_claim` | Turnos que imponen el límite por proveedor y evitan que dos despachos tomen la misma notificación.    |
| Eventos hacia otros sistemas | `subscription`, `outbox_event`, `subscription_delivery`  | Suscriptores con su URL y secreto. Las tablas de eventos ya existen, pero todavía no se llenan.       |

**Puntos clave**

- `UNIQUE(client_app_id, idempotency_key)` evita duplicados; `request_hash` detecta la misma llave con otro
  contenido (responde 409).
- La cola solo lleva el `id`; el estado real siempre está en la tabla `notification`.
- Postgres también coordina la concurrencia (turnos por proveedor), sin Redis: menos piezas, a cambio de más
  escrituras por envío.

**Componentes**

| Componente         | Rol                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `apps/api`         | API Hono en Cloudflare Workers: autenticación, validación, idempotencia, límite y encolado. |
| `apps/dispatcher`  | Worker consumidor de las colas: Strategy, reintentos, fallback y estados.                   |
| `apps/console`     | Consola web (Astro y React) para operar y auditar.                                          |
| `apps/demo-store`  | Tienda de demostración (Cloudflare en local, Vercel en producción).                         |
| `apps/event-relay` | Pendiente (RF5): en `main` solo tiene su README; entregará los eventos a los suscriptores.  |
| `packages/*`       | `domain`, `application`, `persistence`, `providers`, `client` (SDK), `shared` y `ui`.       |

## 6. Cloudflare, Docker y Kubernetes

| Pieza de Cloudflare | En NotifyHub                            | Para qué                                                |
| ------------------- | --------------------------------------- | ------------------------------------------------------- |
| Workers             | API, despachador y consola              | Ejecutan el código; escalan solos según las peticiones. |
| Queues              | `notifications-high`, `-medium`, `-low` | Las colas por prioridad entre la API y el despachador.  |
| Durable Objects     | `RateLimiterObject`                     | El límite de solicitudes por minuto de cada cliente.    |
| Hyperdrive          | `notifyhub`                             | Conexiones abiertas hacia Postgres en Neon.             |

- **Por qué Cloudflare:** el plan gratuito incluye todo lo anterior (costo 0 USD), no hay servidores que operar y no
  hay arranque en frío.
- **Por qué no Docker en producción:** Docker se usa solo en desarrollo (Postgres, Mailpit, WireMock y Grafana). Los
  Workers ejecutan el código directamente; la opción con contenedores (ADR-006) requería el plan de pago.
- **Por qué no Kubernetes:** Cloudflare ya crea las instancias que hagan falta y las retira sin tráfico. Como la API no
  guarda estado en memoria, no hay que decidir cuántos contenedores correr.

El detalle está en [`docs/cola-y-cloudflare.md`](cola-y-cloudflare.md) y en los ADR 002, 006 y 007.
