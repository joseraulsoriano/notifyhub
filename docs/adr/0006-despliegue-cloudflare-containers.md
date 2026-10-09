# ADR-006 · Despliegue en Cloudflare Containers

- **Estado:** aceptada · 2026-10-09 · SCRUM-50

## Contexto

El diagrama de despliegue de S0 dejaba abierto el proveedor (Fly.io o AWS ECS). El equipo ya usa Cloudflare y quiere
publicar la API ahí. La arquitectura de los ADR-001 a 003 no es nativa de Workers: NestJS es un proceso de larga
duración, BullMQ necesita Redis por TCP con comandos bloqueantes y Prisma usa un motor nativo.

## Decisión

- La API corre en **Cloudflare Containers** con la misma imagen de `infra/docker/api.Dockerfile` que construye el CI.
- Un **Worker** (`apps/edge`) recibe el tráfico y lo reparte entre `API_INSTANCES` contenedores con `getRandom`.
  Es posible porque la API no guarda estado en memoria: la idempotencia vive en Postgres y el rate limit en Redis.
- **Postgres gestionado en Neon** (proyecto `notifyhub`, `aws-us-east-1`) y **Redis gestionado** fuera de Cloudflare;
  el contenedor sale a internet (`enableInternet = true`).
- `DATABASE_URL` y `REDIS_URL` son secretos del Worker (`wrangler secret put`) que se inyectan como variables de
  entorno al arrancar cada contenedor. No viven en el repo ni en `wrangler.jsonc`.
- Las migraciones se aplican antes del despliegue (`prisma migrate deploy`), no al arrancar el contenedor, para que
  dos instancias no compitan por migrar.

## Consecuencias

- Requiere el plan **Workers Paid** (5 USD/mes); Containers no está disponible en el plan gratuito.
- `wrangler deploy` construye la imagen con Docker para `linux/amd64`; en Mac con Apple Silicon el build es emulado
  y tarda varios minutos.
- Los contenedores se duermen tras 15 min sin tráfico (`sleepAfter`); la primera petición después paga un arranque
  en frío de NestJS. Aceptable para la demo; en producción real se subiría `sleepAfter`.
- Neon crea proyectos nuevos con **Postgres 18**, no 16 como fija el ADR-003. La migración inicial y el seed se
  aplicaron sin cambios; las pruebas locales y el CI siguen en 16.
- El `dispatcher` (S2) se desplegará como otra clase de contenedor en el mismo Worker, con instancias fijas para que
  no se duerma mientras haya trabajo en cola.

**Alternativas descartadas:** reescribir para Workers nativos con Hono, Cloudflare Queues e Hyperdrive (gratis, pero
sustituye los ADR-001 y 002 a mitad del curso); usar Cloudflare solo como DNS/proxy frente a Render o Koyeb (exige
dominio propio y otro proveedor que operar).
