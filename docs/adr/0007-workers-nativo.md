# ADR-007 · NotifyHub nativo en Cloudflare Workers (plan gratuito)

- **Estado:** aceptada · 2026-10-09 · SCRUM-50
- **Sustituye:** ADR-006 completa; de ADR-001 el uso de NestJS; de ADR-002 BullMQ/Redis; de ADR-004 Redis Streams.

## Contexto

ADR-006 llevaba la API a Cloudflare Containers, pero Containers exige el plan Workers Paid y el equipo decidió no
pagar. En el plan gratuito sí están Workers, Queues (10,000 operaciones/día), Hyperdrive (100,000 consultas/día) y
Durable Objects con SQLite. NestJS, BullMQ e ioredis no corren en Workers.

## Decisión

Se conserva la arquitectura hexagonal: `packages/domain` y `packages/application` (casos de uso y puertos) **no
cambian**. Solo se reemplazan los adaptadores:

| Puerto / capa                                   | Antes (ADR-001/002)            | Ahora                                                 |
| ----------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| HTTP                                            | NestJS 11 + Express            | Hono en un Worker (`apps/api`)                        |
| `NotificationRepository`, `ClientAppRepository` | Prisma Client                  | `pg` sobre **Hyperdrive** hacia Neon Postgres         |
| `NotificationQueue`                             | BullMQ, una cola por prioridad | **Cloudflare Queues** `notifications-high/medium/low` |
| `RateLimiter`                                   | Redis `INCR` + `EXPIRE`        | **Durable Object** por cliente con ventana fija       |
| Bus de eventos (S4)                             | Redis Streams                  | Una cola de Queues para eventos (se detalla en S4)    |

- Prisma se queda para lo que hace mejor: el esquema, las migraciones (`prisma migrate deploy`) y el seed.
- Redis desaparece del sistema.
- Se abre un cliente `pg` por petición y se cierra con `waitUntil` al responder; el pool real lo mantiene Hyperdrive.
- El despachador (S2) será un Worker consumidor de las tres colas.

## Consecuencias

- Costo 0 USD. Los límites diarios del plan gratuito alcanzan para la demo: cada notificación cuesta 3 operaciones de
  cola (escribir, leer, borrar), unas 3,300 notificaciones al día.
- Sin arranques en frío: un Worker responde en milisegundos desde el primer request.
- Queues no deduplica por id como el `jobId` de BullMQ: el despachador debe ser idempotente y apoyarse en la máquina
  de estados (`transition` solo procede desde el estado esperado).
- La prioridad ya no depende de la concurrencia de un worker de BullMQ sino de la configuración de cada consumidor
  (tamaño de lote y concurrencia por cola).
- El rate limit es por cliente y fuerte (un Durable Object atiende sus llamadas de una en una), pero agrega un salto
  de red por petición.
- Neon crea proyectos con Postgres 18; local y CI siguen en 16 (ADR-003) y el esquema funciona igual en ambos.
- `wrangler dev` simula Queues y Durable Objects en local; Hyperdrive apunta al Postgres de Docker Compose.

**Alternativas descartadas:** Workers Paid con Containers (ADR-006, cuesta 5 USD/mes); Worker gratuito como proxy
frente a Render Free (arranque en frío de ~1 min, sin worker gratuito para el despachador y sigue necesitando Redis).
