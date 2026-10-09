# Avance por historia

Corte: 9 de octubre de 2026. Claves: `NH-n` (planeación) = `SCRUM-(n+8)` (Jira).

## Sprint 0 · Planeación y diseño (28 sep – 9 oct)

| Jira     | Historia                        | Resp. | Estado                           | Evidencia                                                                                            |
| -------- | ------------------------------- | ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SCRUM-9  | Alcance, RF y RNF               | JRS   | ✅                               | Descripción de la épica SCRUM-1                                                                      |
| SCRUM-10 | Stack y ADRs                    | JRS   | ✅                               | [docs/adr](adr/README.md): ADR-001 a ADR-005                                                         |
| SCRUM-11 | Modelo de dominio y clases GoF  | AMM   | ✅                               | [03-clases-patrones.mmd](diagrams/03-clases-patrones.mmd) · `packages/domain`                        |
| SCRUM-12 | Modelo ER                       | AMM   | ✅                               | [04-er.mmd](diagrams/04-er.mmd) · [schema.prisma](../packages/persistence/prisma/schema.prisma)      |
| SCRUM-13 | C4 y despliegue                 | JRS   | ✅                               | [01](diagrams/01-contexto.mmd), [02](diagrams/02-contenedores.mmd), [07](diagrams/07-despliegue.mmd) |
| SCRUM-14 | Secuencia y estados             | AMM   | ✅                               | [05](diagrams/05-secuencia-envio.mmd), [06](diagrams/06-estados.mmd) · `status-machine.ts`           |
| SCRUM-15 | Contrato OpenAPI 3.1            | JRS   | ✅                               | [openapi.yaml](api/openapi.yaml), validado con Redocly                                               |
| SCRUM-16 | Cronograma y backlog            | JRS   | ✅                               | Tablero Jira · [backlog.json](planeacion/backlog.json)                                               |
| SCRUM-17 | Riesgos y estrategia de pruebas | AMM   | 🟡 Borrador para revisión de AMM | [riesgos-y-pruebas.md](riesgos-y-pruebas.md)                                                         |

## Sprint 1 · Núcleo y recepción, RF1 (12 – 23 oct), adelantado

| Jira          | Historia                                                                              | Resp. | Estado                                              | Evidencia                                                                                     |
| ------------- | ------------------------------------------------------------------------------------- | ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| SCRUM-18      | Monorepo pnpm + Turborepo, TS estricto, ESLint, Prettier, Conventional Commits, Husky | JRS   | ✅                                                  | `package.json`, `turbo.json`, `eslint.config.mjs`, `.husky/`                                  |
| SCRUM-19      | Entorno local con Docker Compose                                                      | JRS   | ✅                                                  | [infra/compose.yaml](../infra/compose.yaml): Postgres, Redis, Mailpit, WireMock, Grafana LGTM |
| SCRUM-20      | CI en GitHub Actions                                                                  | JRS   | 🟡 Pipeline listo; falta proteger `main`            | [.github/workflows/ci.yml](../.github/workflows/ci.yml)                                       |
| SCRUM-21      | `POST /v1/notifications` con validación                                               | AMM   | 🟡 Implementado; falta revisión de AMM              | `apps/api/src/notifications` · 6 pruebas e2e                                                  |
| SCRUM-22      | Idempotency-Key y deduplicación (24 h)                                                | JRS   | ✅                                                  | `accept-notification.ts` · índice único en BD · 4 pruebas                                     |
| SCRUM-23      | Persistir y encolar por prioridad en BullMQ                                           | AMM   | 🟡 Implementado; falta revisión de AMM              | `bullmq-notification-queue.ts` · verificado con Redis real                                    |
| SCRUM-24      | API key y rate limiting                                                               | JRS   | ✅                                                  | `api-key.guard.ts`, `rate-limit.guard.ts` · 401 y 429 probados                                |
| SCRUM-25      | `GET /v1/notifications/{id}`                                                          | AMM   | 🟡 Implementado; falta revisión de AMM              | estado + intentos + historial · 2 pruebas                                                     |
| SCRUM-26 (S2) | Secretos y configuración por entorno                                                  | JRS   | 🟡 Parcial                                          | La configuración se valida con Zod al arrancar; secretos de producción en `wrangler secret`   |
| SCRUM-50      | Despliegue en Cloudflare Containers                                                   | JRS   | 🟡 Listo para desplegar; falta Workers Paid y Redis | [despliegue.md](despliegue.md) · [ADR-006](adr/0006-despliegue-cloudflare-containers.md)      |

> Corrección (9 oct): el commit `56a2c7d` y la versión anterior de esta tabla tenían las claves SCRUM-21 a 26 corridas
> una posición. Las de arriba coinciden con Jira.

## Verificación

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: sin errores.
- `pnpm test`: 23 pruebas en verde.
- `tests/e2e/smoke.sh` contra Postgres 16 y Redis 7 reales: POST 202 → reintento idempotente 202 → GET con
  historial `RECEIVED → QUEUED` → 401 sin llave. El trabajo quedó en `notifications-high` y la bitácora tiene
  2 entradas.
- La imagen Docker de la API se construyó y respondió dentro de Compose.

## Siguiente (Sprint 2, desde el 26 oct)

1. SCRUM-27 / SCRUM-28 (AMM): `NotificationSender`, `BaseSender` y `SenderCreator` + `SenderRegistry` leyendo `config/routing.yaml`.
2. SCRUM-33 (JRS): `apps/dispatcher` consumiendo las tres colas, con el barrido de notificaciones en `RECEIVED`.
3. SCRUM-29 a SCRUM-32: adaptadores SendGrid, Twilio, FCM y Webhook contra WireMock y sandbox.
