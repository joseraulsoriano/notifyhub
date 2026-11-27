# Event relay

Worker que conecta el outbox transaccional con los webhooks registrados:

1. Cada transición de estado y cada intento se guarda en `outbox_event` dentro de la misma transacción que su cambio
   o intento de entrega.
2. El Cron publica el ID del evento pendiente en `webhook-deliveries`; el consumidor crea de forma idempotente una
   fila `subscription_delivery` por suscripción activa que escucha ese tipo y encola cada entrega.
3. El consumidor de entregas envía el evento por HTTPS con `X-Signature: sha256=<hex>` y
   `X-NotifyHub-Event-Id: <uuid>`. Solo las respuestas HTTP `2xx` confirman la entrega.

La firma es HMAC-SHA256 del cuerpo HTTP exacto. Para no guardar el secreto en claro, la clave HMAC son los 32 bytes
del SHA-256 del `signingSecret` devuelto al crear la suscripción. Los receptores deben calcular primero
`SHA256(signingSecret)` y usar ese digest binario como clave HMAC. `X-NotifyHub-Subscription-Id` identifica la
suscripción para validar la firma. El secreto se muestra una sola vez.

La entrega es al menos una vez: un fallo después de que el destino procese el POST puede provocar un duplicado.
Deduplica usando el ID estable del evento. Errores HTTP, timeouts y fallos de red se reintentan con espera
exponencial; después de ocho intentos la entrega queda `FAILED`. Errores de infraestructura de Queue van a
`webhook-deliveries-dead-letter`.

Los cuerpos JSON incluyen `id`, `type`, `notificationId` y `occurredAt`. `notification.status_changed` añade
`from`, `to` y, si existe, `detail`; `notification.attempted` añade `providerCode`, `channel`, `attemptNumber`,
`isFallback`, `status`, `errorCode` y `latencyMs`.

## Desarrollo y despliegue

La API, el dispatcher y este Worker comparten Postgres/Hyperdrive. En local, ejecuta Wrangler desde `apps/api` con
las configuraciones de los tres Workers para iniciar los productores y consumidores de Queue. Para desplegar:

```sh
pnpm --filter @notifyhub/event-relay deploy
```

La configuración incluye un Cron por minuto, la cola `webhook-deliveries` y su cola de mensajes fallidos. Los
receptores deben responder rápidamente; el Worker aplica un timeout de 10 segundos y no sigue redirecciones. El
Worker `apps/webhook-inbox` se despliega como `notify` y ofrece `https://notify.<subdominio>.workers.dev/notify`;
verifica la firma contra una suscripción activa, responde `204` y registra solo metadatos del evento en los logs.
En
un despliegue manual, crea `webhook-deliveries` con `wrangler queues create webhook-deliveries` antes del primer
deploy; la cola de mensajes fallidos se aprovisiona al desplegar el consumidor.
