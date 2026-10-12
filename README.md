# NotifyHub

Servicio de Notificaciones y Registro Multicanal. Recibe alertas, elige el proveedor adecuado (SendGrid, Twilio,
Firebase Cloud Messaging o Webhook), conmuta a un canal secundario si el principal falla y deja bitácora y eventos de
cada intento. Proyecto de Arquitectura de Software construido alrededor de los patrones GoF **Factory Method**,
**Strategy** y **Observer**. Código abierto bajo licencia [MIT](LICENSE).

![ruta de un mensaje: tres intentos en Push y transbordo a SMS](docs/screens/02-notificacion-fallback.png)

- **José Raúl Soriano Cazabal**: encargado del proyecto y líder técnico
- **Andreea Margarita Maldonado Morales**: especialista del proyecto
- Tablero: [Jira · SCRUM](https://arquitectura-so.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog)

## Estado

| Sprint          | Fechas         | Objetivo                                                            | Estado                                                        |
| --------------- | -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| S0 · Planeación | 28 sep – 9 oct | Requisitos, ADRs, modelos, diagramas, contrato de API, riesgos      | ✅ Entregado                                                  |
| S1 · RF1        | 12 – 23 oct    | Monorepo, entorno local, CI, recepción y consulta de notificaciones | 🟡 Implementado, en revisión; incluye consola web y librerías |
| S2 · RF2        | 26 oct – 6 nov | Factory Method y adaptadores de proveedores, worker despachador     | 🟡 MVP del despachador en revisión (proveedores simulados)    |
| S3 · RF3 + RF4  | 9 – 20 nov     | Strategy, fallback, circuit breaker y bitácora                      | 🟡 Strategy, fallback y consulta de bitácora en revisión      |
| S4 · RF5        | 23 nov – 4 dic | Observer, outbox, dashboards, carga y entrega final                 | ⏳                                                            |

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

### Ver una notificación avanzar hasta entregarse

La API y el despachador comparten las colas locales cuando corren en la misma sesión de `wrangler dev`:

```bash
cd apps/api && npx wrangler dev -c wrangler.jsonc -c ../dispatcher/wrangler.jsonc --port 8787
# en otra terminal, la consola web en http://localhost:4321
pnpm --filter @notifyhub/console dev
```

En la consola pulsa **Conectar** y usa `http://localhost:8787` con la llave `nh_dev_local_key`. Para ver el fallback en vivo,
marca `fcm` como **Caído** en «Proveedores y ruteo» (requiere `--var "PROVIDER_ADMIN_CLIENTS:*"` en `wrangler dev`) y envía una
notificación por Push: tres intentos `503`, transbordo a SMS y entrega.

El contrato completo está en [docs/api/openapi.yaml](docs/api/openapi.yaml). La API corre en Cloudflare Workers
(plan gratuito): Hono, Queues, Hyperdrive hacia Neon y un Durable Object para el rate limit
([ADR-007](docs/adr/0007-workers-nativo.md)). Despliegue en [docs/despliegue.md](docs/despliegue.md).

## Usarlo como librería

Dos paquetes del monorepo, pensados para publicarse en npm:

| Paquete                                | Para qué                                                                                                                             |                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| [`@notifyhub/client`](packages/client) | SDK de TypeScript sin dependencias para la API: crear (con `Idempotency-Key`), consultar, listar, proveedores y bitácora             | [README](packages/client/README.md) |
| [`@notifyhub/ui`](packages/ui)         | Componentes React: fila de notificación, **detalle con la ruta del mensaje**, mapa de rutas, hooks con sondeo y los tokens de diseño | [README](packages/ui/README.md)     |

```ts
import { createNotifyHubClient } from '@notifyhub/client';

const notifyhub = createNotifyHubClient({
  baseUrl: 'https://tu-api.workers.dev',
  apiKey: process.env.NOTIFYHUB_API_KEY!,
});
const { id } = await notifyhub.notifications.create(
  {
    sender: { name: 'Mi tienda' },
    recipient: { email: 'ana@example.com', phone: '+5215512345678' },
    message: { subject: 'Tu pedido va en camino', body: 'Llega mañana.' },
    priority: 'alta',
    preferredChannel: 'EMAIL',
  },
  { idempotencyKey: 'pedido-4821' },
);
console.log((await notifyhub.notifications.get(id)).attempts); // intentos y fallback
```

La **consola web** ([`apps/console`](apps/console)) es la aplicación de referencia que usa ambos paquetes. Sin conexión funciona en
modo demo, con un cliente simulado que cumple la misma interfaz.

## Qué es real y qué es simulado

- **Real:** recepción con idempotencia y límite de solicitudes, colas por prioridad, máquina de estados, reintentos con
  backoff, fallback entre canales, intentos y bitácora en Postgres, API de consulta, SDK y consola.
- **Simulado:** los proveedores (SendGrid, Twilio, FCM y webhook). Su comportamiento sale de `provider.health` (`UP`, `DEGRADED`,
  `DOWN`) para poder demostrar el fallback sin credenciales. Los adaptadores reales son SCRUM-29 a SCRUM-32.
- **Pendiente:** outbox y suscripciones por webhook (RF5), circuit breaker, health checks activos y barrido de rezagados.

## Estructura

```
apps/
  api/            Worker Hono: recepción, consulta, listado, proveedores y bitácora
  dispatcher/     Worker consumidor de Queues: despacho, reintentos y fallback
  console/        Consola web (Astro + React + shadcn/ui), usa client y ui
  event-relay/    outbox → cola de eventos → webhooks (RF5)            ← S4
packages/
  domain/         entidades, estados y errores; sin dependencias
  application/    casos de uso, puertos y despacho (Strategy, Factory, Observer)
  providers/      emisores (Template Method) y creadores (Factory Method); transporte simulado
  persistence/    esquema y migraciones Prisma; repositorios con pg
  shared/         configuración validada y nombres de colas
  client/         @notifyhub/client · SDK de TypeScript
  ui/             @notifyhub/ui · componentes React y tokens de diseño
config/routing.yaml   proveedores, estrategias y cadenas de fallback
infra/                Docker Compose (Postgres y herramientas), mocks de WireMock
docs/                 ADRs, diagramas Mermaid, OpenAPI, riesgos y pruebas
```

| Patrón                              | Dónde                                                                                                      | Sprint   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Factory Method                      | `packages/application/src/dispatch`: `SenderCreator` y `SenderRegistry`; creadores en `packages/providers` | MVP      |
| Template Method / Adapter           | `packages/providers`: `BaseSender` y un emisor por proveedor                                               | MVP      |
| Strategy                            | `dispatch/strategies.ts`: `CostStrategy`, `PriorityStrategy`, `AvailabilityStrategy`                       | MVP      |
| Chain of Responsibility / Decorator | `FallbackPolicy` y reintentos (circuit breaker pendiente)                                                  | MVP / S3 |
| Observer                            | `dispatch/event-publisher.ts`: `EventPublisher` (outbox y suscriptores: S4)                                | MVP / S4 |

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

## Contribuir y licencia

Lee [CONTRIBUTING.md](CONTRIBUTING.md) y [SECURITY.md](SECURITY.md). El código se publica bajo la licencia [MIT](LICENSE).

## In English

**NotifyHub** is a multichannel notification service built on Cloudflare Workers (Hono, Queues, Hyperdrive + Postgres). It accepts a
request, picks a provider per channel, retries with exponential backoff and, when a channel is exhausted, **falls back** to the next
one, recording every attempt in an append-only audit log. It is organized around the Factory Method, Strategy and Observer patterns.

The repo also ships two reusable packages: **`@notifyhub/client`** (a zero-dependency TypeScript SDK) and **`@notifyhub/ui`** (React
components that draw a message's route — each channel is a metro line, each attempt a station and a fallback a transfer). Providers
are **simulated** in this version (their behavior follows `provider.health`), so the fallback can be demonstrated without credentials.
Licensed under MIT.
