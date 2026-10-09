# NotifyHub

Servicio de Notificaciones y Registro Multicanal. Recibe alertas, elige el proveedor adecuado (SendGrid, Twilio,
Firebase Cloud Messaging o Webhook), conmuta a un canal secundario si el principal falla y deja bitácora y eventos de
cada intento. Proyecto de Arquitectura de Software construido alrededor de los patrones GoF **Factory Method**,
**Strategy** y **Observer**.

- **José Raúl Soriano Cazabal**: encargado del proyecto y líder técnico
- **Andreea Margarita Maldonado Morales**: especialista del proyecto
- Tablero: [Jira · SCRUM](https://arquitectura-so.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog)

## Estado

| Sprint          | Fechas         | Objetivo                                                            | Estado                       |
| --------------- | -------------- | ------------------------------------------------------------------- | ---------------------------- |
| S0 · Planeación | 28 sep – 9 oct | Requisitos, ADRs, modelos, diagramas, contrato de API, riesgos      | ✅ Entregado                 |
| S1 · RF1        | 12 – 23 oct    | Monorepo, entorno local, CI, recepción y consulta de notificaciones | 🟡 Implementado, en revisión |
| S2 · RF2        | 26 oct – 6 nov | Factory Method y adaptadores de proveedores, worker despachador     | ⏳                           |
| S3 · RF3 + RF4  | 9 – 20 nov     | Strategy, fallback, circuit breaker y bitácora                      | ⏳                           |
| S4 · RF5        | 23 nov – 4 dic | Observer, outbox, dashboards, carga y entrega final                 | ⏳                           |

Detalle por historia en [docs/avance.md](docs/avance.md).

## Arranque rápido

Requisitos: Node.js 22+, pnpm 11 y Docker (solo para Postgres local).

```bash
pnpm install
cp .env.example .env
pnpm infra:up                                    # Postgres, Mailpit, WireMock, Grafana
pnpm build
pnpm --filter @notifyhub/persistence db:deploy   # migraciones
pnpm db:seed                                     # cliente de desarrollo + proveedores
pnpm dev                                         # wrangler dev → http://localhost:8787
```

Enviar una notificación:

```bash
curl -X POST localhost:8787/v1/notifications \
  -H 'X-API-Key: nh_dev_local_key' \
  -H 'Idempotency-Key: pedido-0001' \
  -H 'Content-Type: application/json' \
  -d '{
    "sender": { "name": "Banco Demo" },
    "recipient": { "email": "ana@example.com", "phone": "+5212221234567" },
    "message": { "subject": "Cargo detectado", "body": "Se hizo un cargo de $1,200." },
    "priority": "alta",
    "preferredChannel": "EMAIL"
  }'
# → 202 {"id":"…","status":"QUEUED",…}

curl localhost:8787/v1/notifications/<id> -H 'X-API-Key: nh_dev_local_key'
```

El contrato completo está en [docs/api/openapi.yaml](docs/api/openapi.yaml). La API corre en Cloudflare Workers
(plan gratuito): Hono, Queues, Hyperdrive hacia Neon y un Durable Object para el rate limit
([ADR-007](docs/adr/0007-workers-nativo.md)). Despliegue en [docs/despliegue.md](docs/despliegue.md).

## Estructura

```
apps/
  api/            Worker Hono: recepción (RF1), consulta de estado     ← S1
  dispatcher/     Worker consumidor de Queues: despacho y fallback     ← S2–S3
  event-relay/    outbox → cola de eventos → webhooks (RF5)            ← S4
packages/
  domain/         entidades, estados y errores; sin dependencias
  application/    casos de uso y puertos; solo depende de domain
  persistence/    esquema y migraciones Prisma; repositorios con pg
  shared/         configuración validada y nombres de colas
config/routing.yaml   proveedores, estrategias y cadenas de fallback
infra/                Docker Compose (Postgres y herramientas), mocks de WireMock
docs/                 ADRs, diagramas Mermaid, OpenAPI, riesgos y pruebas
```

| Patrón                              | Dónde                                                                          | Sprint |
| ----------------------------------- | ------------------------------------------------------------------------------ | ------ |
| Factory Method                      | `packages/providers`: `SenderCreator` y `SenderRegistry`                       | S2     |
| Template Method / Adapter           | `BaseSender` y un emisor por proveedor                                         | S2     |
| Strategy                            | `packages/routing`: `CostStrategy`, `PriorityStrategy`, `AvailabilityStrategy` | S3     |
| Chain of Responsibility / Decorator | `FallbackPolicy`, reintentos y circuit breaker                                 | S3     |
| Observer                            | `packages/events`: `EventPublisher` y suscriptores                             | S4     |

Diagramas: [contexto](docs/diagrams/01-contexto.mmd) · [contenedores](docs/diagrams/02-contenedores.mmd) ·
[clases y patrones](docs/diagrams/03-clases-patrones.mmd) · [ER](docs/diagrams/04-er.mmd) ·
[secuencia](docs/diagrams/05-secuencia-envio.mmd) · [estados](docs/diagrams/06-estados.mmd) ·
[despliegue](docs/diagrams/07-despliegue.mmd)

## Comandos

| Comando                             | Qué hace                                             |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm test`                         | Pruebas de todos los paquetes                        |
| `pnpm lint` / `pnpm typecheck`      | ESLint (incluye reglas de dependencias) y TypeScript |
| `pnpm build`                        | Compila todo con Turborepo                           |
| `bash tests/e2e/smoke.sh`           | Prueba de humo contra la API levantada               |
| `pnpm infra:up` / `pnpm infra:down` | Entorno local                                        |

Stack y razones en [docs/adr](docs/adr/README.md).
