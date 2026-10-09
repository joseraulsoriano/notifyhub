# ADR-002 · Colas por prioridad con BullMQ sobre Redis 7

- **Estado:** aceptada · 2026-09-30 · NH-2 (SCRUM-10)

## Contexto

RF1 exige aceptar solicitudes con prioridad alta, media o baja; el RNF de rendimiento pide responder en < 200 ms (p95)
y soportar 1,000 notificaciones/min. El envío a proveedores es lento e incierto.

## Decisión

- La API **persiste y encola** y responde `202`; el envío ocurre en workers.
- **Una cola por prioridad** (`notifications-high`, `-medium`, `-low`). El despachador asigna más concurrencia a la
  alta y la consume primero; una cola única con `priority` de BullMQ no aísla un pico de prioridad baja.
- `jobId = notificationId` para que un reencolado no duplique trabajos.
- Si Redis falla al encolar, la notificación queda en `RECEIVED` y un barrido del despachador la recupera (NH-25).

## Consecuencias

- Reintentos con backoff, trabajos diferidos y panel (Bull Board) sin infraestructura adicional.
- Redis pasa a ser crítico: se usa AOF (`appendonly yes`) y, en producción, ElastiCache con réplica.

**Alternativas descartadas:** RabbitMQ (otra pieza que operar), SQS (amarra a AWS desde el día uno).
