# ADR-003 · PostgreSQL 16 con Prisma

- **Estado:** aceptada · 2026-10-01 · NH-2 (SCRUM-10)

## Contexto

Se necesitan transacciones (solicitud + bitácora + outbox en una sola operación), JSONB para guardar las respuestas
crudas de cada proveedor y particionado mensual para la bitácora (RF4, retención de 12 meses).

## Decisión

- **PostgreSQL 16**. Idempotencia con índice único `(client_app_id, idempotency_key)`; la carrera entre dos
  solicitudes con la misma llave la resuelve la base, no la aplicación.
- **Prisma 6** (`prisma-client-js`) para esquema declarativo, migraciones versionadas y tipos generados. El cliente se
  genera dentro de `packages/persistence/generated` para que viaje con el paquete en la imagen Docker.
- El particionado y el bloqueo de `UPDATE`/`DELETE` en `audit_log` se hacen con SQL propio en una migración (NH-30),
  porque Prisma no los modela.

## Consecuencias

- Prisma 7 cambia a ESM y adaptadores de driver; se evaluará al cerrar el Sprint 4 para no migrar a mitad del curso.

**Alternativas descartadas:** MongoDB (sin transacciones simples con el outbox), TypeORM (migraciones más frágiles).
