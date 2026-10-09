# Decisiones de arquitectura (ADR)

| ADR                                             | Decisión                                             | Estado   |
| ----------------------------------------------- | ---------------------------------------------------- | -------- |
| [001](0001-monorepo-typescript-nestjs.md)       | Monorepo TypeScript, NestJS y arquitectura hexagonal | Aceptada |
| [002](0002-colas-bullmq-redis.md)               | Colas por prioridad con BullMQ sobre Redis           | Aceptada |
| [003](0003-postgresql-prisma.md)                | PostgreSQL 16 con Prisma                             | Aceptada |
| [004](0004-eventos-outbox-redis-streams.md)     | Observer + outbox transaccional + Redis Streams      | Aceptada |
| [005](0005-observabilidad-opentelemetry.md)     | OpenTelemetry y Grafana LGTM                         | Aceptada |
| [006](0006-despliegue-cloudflare-containers.md) | Despliegue en Cloudflare Containers con Neon         | Aceptada |

Formato: contexto → decisión → consecuencias → alternativas descartadas. Una ADR aceptada no se edita; se reemplaza
con otra que la marque como _sustituida_.
