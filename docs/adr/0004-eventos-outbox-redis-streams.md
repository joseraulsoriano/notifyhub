# ADR-004 · Eventos con Observer, outbox transaccional y Redis Streams

- **Estado:** aceptada · 2026-10-01 · NH-2 (SCRUM-10) · _sustituida en parte por [ADR-007](0007-workers-nativo.md): Redis Streams → Queues_

## Contexto

RF5 pide emitir los cambios de estado a servicios suscriptores. Si el proceso cae entre guardar el estado y publicar
el evento, el evento no debe perderse.

## Decisión

- Dentro del proceso, **Observer**: `EventPublisher` notifica a `AuditLogSubscriber`, `MetricsSubscriber` y
  `OutboxSubscriber`, sin que el despachador conozca a ninguno.
- Hacia fuera, **Transactional Outbox**: el evento se escribe en `outbox_event` en la misma transacción que el cambio
  de estado; `apps/event-relay` lo publica en **Redis Streams** y lo entrega por webhook firmado a los suscriptores.
- El bus queda detrás de un puerto para migrar a Kafka o NATS si el volumen lo pide.

## Consecuencias

- Entrega _al menos una vez_: los suscriptores deben ser idempotentes (cada evento lleva `id`).

**Alternativas descartadas:** Kafka (excesivo para el volumen del curso), publicar directo desde el despachador
(pierde eventos si el proceso cae).
