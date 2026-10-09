# Despliegue en Cloudflare

Decisión y razones en [ADR-006](adr/0006-despliegue-cloudflare-containers.md). Diagrama:
[07-despliegue.mmd](diagrams/07-despliegue.mmd).

## Qué está conectado

| Pieza              | Dónde                                                            | Estado                |
| ------------------ | ---------------------------------------------------------------- | --------------------- |
| Código y CI        | GitHub `joseraulsoriano/notifyhub` (privado)                     | ✅ CI en verde        |
| Imagen de la API   | GHCR `ghcr.io/joseraulsoriano/notifyhub/api:<sha>`               | ✅ la publica el CI   |
| Worker + Container | Cloudflare, cuenta `sc202357155@alm.buap.mx`, Worker `notifyhub` | ⏳ falta Workers Paid |
| Postgres           | Neon, proyecto `notifyhub` (`dry-hat-07081567`), `aws-us-east-1` | ✅ migrado y sembrado |
| Redis              | Por definir (Redis Cloud free, 30 MB)                            | ⏳ falta crear        |
| Tablero            | Jira `arquitectura-so`, historia SCRUM-50                        | En curso              |

## Primer despliegue (local)

Requisitos: Docker corriendo, `wrangler login` hecho y plan Workers Paid activo en la cuenta.

```bash
cd apps/edge

# 1. Secretos del Worker: se leen del llavero de macOS y se pasan por stdin, nunca como argumento.
security find-generic-password -s notifyhub-database-url -a neon -w | pnpm wrangler secret put DATABASE_URL
security find-generic-password -s notifyhub-redis-url -a prod -w   | pnpm wrangler secret put REDIS_URL

# 2. Construye la imagen (amd64), la sube al registro de Cloudflare y publica el Worker.
pnpm deploy
```

El primer despliegue tarda unos minutos en aprovisionar los contenedores; mientras tanto el Worker responde 503.

## Migraciones

Se aplican antes de desplegar, nunca al arrancar el contenedor:

```bash
DATABASE_URL="$(security find-generic-password -s notifyhub-database-url -a neon -w)" \
  pnpm --filter @notifyhub/persistence db:deploy
```

## Despliegue desde GitHub Actions

El workflow [Deploy](../.github/workflows/deploy.yml) se lanza a mano (`gh workflow run deploy.yml`). Necesita estos
secretos del repo:

| Secreto                 | De dónde sale                                                                 |
| ----------------------- | ----------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Token de cuenta con la plantilla "Edit Cloudflare Workers" + Containers: Edit |
| `CLOUDFLARE_ACCOUNT_ID` | `247e74237cc1505e56c6ea6714cf0be6`                                            |
| `DATABASE_URL`          | Neon → proyecto `notifyhub` → Connection string                               |

Los secretos del Worker (`DATABASE_URL`, `REDIS_URL`) ya quedan guardados en Cloudflare tras el primer
`wrangler secret put`; el workflow no los vuelve a subir.

## Verificación

```bash
URL=https://notifyhub.<subdominio>.workers.dev
KEY="$(security find-generic-password -s notifyhub-api-key -a prod -w)"
curl -s "$URL/health"
curl -s -X POST "$URL/v1/notifications" -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d '{"sender":{"name":"Demo"},"recipient":{"email":"demo@example.com"},"message":{"body":"hola"},"priority":"alta","preferredChannel":"EMAIL"}'
```

La API key de producción se generó al sembrar Neon y vive solo en el llavero (`notifyhub-api-key`).
