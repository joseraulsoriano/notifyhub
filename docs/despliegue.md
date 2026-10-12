# Despliegue en Cloudflare (plan gratuito)

Decisión y razones en [ADR-007](adr/0007-workers-nativo.md). Diagrama: [07-despliegue.mmd](diagrams/07-despliegue.mmd).

## Qué está conectado

| Pieza           | Dónde                                                                   | Estado                |
| --------------- | ----------------------------------------------------------------------- | --------------------- |
| Código y CI     | GitHub `joseraulsoriano/notifyhub` (privado)                            | ✅                    |
| Worker          | Cloudflare `sc202357155@alm.buap.mx` (Free), Worker `notifyhub-api`     | ⏳ primer deploy      |
| Colas           | Queues `notifications-high`, `-medium`, `-low`                          | ✅ creadas            |
| Pool a Postgres | Hyperdrive `notifyhub` (`49c31e43fadf4d10952b31c0257d8c4a`)             | ✅ creado             |
| Rate limit      | Durable Object `RateLimiterObject` (SQLite), se crea con el deploy      | ⏳ primer deploy      |
| Postgres        | Neon, proyecto `notifyhub` (`dry-hat-07081567`), `aws-us-east-1`, PG 18 | ✅ migrado y sembrado |
| Tablero         | Jira `arquitectura-so`, historia SCRUM-50                               | En curso              |

Límites del plan gratuito que importan: 100,000 peticiones/día al Worker, 10,000 operaciones/día de Queues (unas
3,300 notificaciones) y 100,000 consultas/día por Hyperdrive.

## Desplegar

Requisito: `wrangler login` hecho con la cuenta de arriba. No hace falta Docker ni secretos: la conexión a Neon vive
en la configuración de Hyperdrive.

```bash
pnpm install
pnpm turbo run build --filter=@notifyhub/api...
pnpm --filter @notifyhub/api run deploy      # imprime la URL https://notifyhub-api.<subdominio>.workers.dev
```

## Despachador

El Worker `notifyhub-dispatcher` (`apps/dispatcher`) consume las tres colas. Se despliega aparte y no tiene URL pública:

```bash
pnpm --filter @notifyhub/dispatcher run deploy
```

Una cola solo admite un consumidor: si ya hay otro Worker consumiendo `notifications-*`, el despliegue falla.

## Migraciones

Se aplican antes de desplegar, desde Node (Prisma no corre en el Worker):

```bash
DATABASE_URL="$(security find-generic-password -s notifyhub-database-url -a neon -w)" \
  pnpm --filter @notifyhub/persistence db:deploy
```

## Despliegue desde GitHub Actions

El workflow [Deploy](../.github/workflows/deploy.yml) se lanza a mano (`gh workflow run deploy.yml`) y necesita estos
secretos del repo, en el entorno `production`:

| Secreto                 | De dónde sale                                                          |
| ----------------------- | ---------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Token de cuenta con la plantilla "Edit Cloudflare Workers"             |
| `CLOUDFLARE_ACCOUNT_ID` | `247e74237cc1505e56c6ea6714cf0be6`                                     |
| `DATABASE_URL`          | Neon → proyecto `notifyhub` → Connection string (para las migraciones) |

## Verificación

```bash
URL=https://notifyhub-api.<subdominio>.workers.dev
KEY="$(security find-generic-password -s notifyhub-api-key -a prod -w)"
curl -s "$URL/health"
curl -s -X POST "$URL/v1/notifications" -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d '{"sender":{"name":"Demo"},"recipient":{"email":"demo@example.com"},"message":{"body":"hola"},"priority":"alta","preferredChannel":"EMAIL"}'
```

La API key de producción se generó al sembrar Neon y vive solo en el llavero de macOS (`notifyhub-api-key`).

## Local

`pnpm infra:up` levanta Postgres; `pnpm dev` corre el Worker con `wrangler dev` en `http://localhost:8787`. Para ver las notificaciones avanzar hasta `DELIVERED` hay que correr la API y el despachador en la misma sesión (ver `apps/dispatcher/README.md`).
Hyperdrive usa `localConnectionString` de `apps/api/wrangler.jsonc`, y Queues y el Durable Object se simulan en
local. `tests/e2e/smoke.sh` hace lo mismo en CI.
