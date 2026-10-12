# @notifyhub/client

SDK de TypeScript para la API de **NotifyHub**: manda notificaciones por correo, SMS, push o webhook y consulta su ruta, incluido el fallback entre canales. Sin dependencias; usa `fetch`.

```bash
pnpm add @notifyhub/client
```

```ts
import { createNotifyHubClient } from '@notifyhub/client';

const notifyhub = createNotifyHubClient({
  baseUrl: 'https://notifyhub-api.example.workers.dev',
  apiKey: process.env.NOTIFYHUB_API_KEY!,
});

// 202: aceptada y en cola. El envío ocurre en segundo plano.
const created = await notifyhub.notifications.create(
  {
    sender: { name: 'Mi tienda' },
    recipient: { email: 'ana@example.com', phone: '+5215512345678' },
    message: { subject: 'Tu pedido va en camino', body: 'Llega mañana antes de las 14:00.' },
    priority: 'alta',
    preferredChannel: 'EMAIL',
  },
  { idempotencyKey: 'pedido-4821-envio' }, // repetirla no duplica el envío
);

// Estado, intentos de entrega e historial.
const detail = await notifyhub.notifications.get(created.id);
console.log(detail.status, detail.attempts);
```

## Qué incluye

| Área            | Métodos                                                               |
| --------------- | --------------------------------------------------------------------- |
| `notifications` | `create`, `get`, `list` (filtros, búsqueda y cursor)                  |
| `providers`     | `list`, `update` (salud y habilitado; requiere un cliente autorizado) |
| `auditLog`      | `list` (filtros por notificación, evento, canal, proveedor y fechas)  |
| `health()`      | comprobación de la API                                                |

Todos los métodos devuelven tipos del contrato (`NotificationListItem`, `NotificationDetail`, `Provider`…). Los errores son `NotifyHubError` con `status`, `title`, `detail`, `errors` (validación) y `retryAfterSeconds` (límite de solicitudes).

La lista devuelve el dato de contacto **enmascarado** (`a***@example.com`).

## Seguridad

La API key da acceso completo a tu cuenta. Úsala desde servidores o consolas de confianza, nunca la publiques en código de un sitio abierto. Para llamar desde un navegador, el origen debe estar en `CORS_ALLOWED_ORIGINS` de la API.

## Otras implementaciones

`NotifyHubClient` es una interfaz: una aplicación puede entregar su propia implementación (por ejemplo una simulada para demostraciones) a la UI de [`@notifyhub/ui`](../ui).

Licencia MIT.
