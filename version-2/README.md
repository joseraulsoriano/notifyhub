# TaskFlow · versión 2

Implementación independiente del **Proyecto 4: Sistema de gestión de tareas colaborativo con notificaciones**. No modifica la versión principal de NotifyHub.

## Arquitectura

- **API Gateway** (`:8080`): valida JWT, verifica la lista de revocación en Redis y enruta las solicitudes. Los servicios internos no publican puertos al host.
- **auth-service**: registro, inicio/cierre de sesión, roles y JWT firmado. Los registros públicos reciben el rol `member`; el rol no se acepta desde el cliente.
- **task-service**: proyectos, miembros, tareas, autorización por proyecto, caché-aside de Redis con TTL de 60 s e invalidación al cambiar una tarea.
- **notification-service**: consume `task-events` por Redis Pub/Sub, guarda notificaciones en PostgreSQL y las entrega en vivo por Server-Sent Events. La clave única por evento y usuario evita duplicados entre réplicas.
- **presence-service**: estado en línea y sesiones con expiración en Redis.
- **PostgreSQL 16**: persistencia. Los servicios usan esquemas separados (`auth`, `tasks`, `notifications`).

Un proyecto nuevo asigna al creador como líder. El líder o un admin puede añadir miembros y asignar tareas; un miembro puede autoasignarse una tarea disponible y solo cambiar el estado de tareas que tenga asignadas. Los roles válidos son `admin`, `leader` y `member`; el primer admin se configura por variables de entorno.

## Arranque local

Requisitos: Docker Compose y Node.js 22+.

```bash
cp .env.example .env
# Cambia JWT_SECRET y BOOTSTRAP_ADMIN_PASSWORD antes de usarlo fuera de una demo local.
docker compose up --build
```

La API queda disponible en `http://localhost:8080`. Solo el gateway está expuesto al host. Para apagar el entorno: `docker compose down`; para borrar también los datos persistidos, `docker compose down -v`.

## Recorrido rápido

Registra un usuario miembro:

```bash
curl -s http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana","email":"ana@example.com","password":"ClaveSegura-123"}'
```

Inicia sesión con ese usuario o con el admin de `.env`; usa el `accessToken` devuelto como `TOKEN`:

```bash
curl -s http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeMe-Now-123!"}'

curl -s http://localhost:8080/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Proyecto piloto","members":["UUID_DEL_MIEMBRO"]}'
```

Crea tareas en `POST /api/projects/{projectId}/tasks`; el líder puede asignarlas mediante `assigneeId` o `PATCH /api/tasks/{taskId}/assignee`. El miembro asignado actualiza `PATCH /api/tasks/{taskId}/status` con `pending`, `in_progress` o `completed`. Conecta un cliente SSE a `GET /api/notifications/stream` y lista el historial con `GET /api/notifications`.

Para cambiar un usuario de rol, un admin usa `PATCH /api/auth/users/{id}/role` con `{"role":"leader"}` o `{"role":"member"}`. El cierre de sesión se realiza con `POST /api/auth/logout`; el JWT queda en la lista de revocación hasta su vencimiento y se elimina su sesión activa.

## Contrato y pruebas

- API documentada en [`openapi.yaml`](./openapi.yaml).
- Pruebas unitarias de autorización: `npm test`.
- Prueba de integración de gateway, auth, tareas, notificaciones y presencia: con Compose arriba, ejecuta `TASKFLOW_API_URL=http://localhost:8080 TASKFLOW_ADMIN_EMAIL=admin@example.com TASKFLOW_ADMIN_PASSWORD='ChangeMe-Now-123!' npm run test:integration`.
- Variables y valores TTL: `.env.example`; JWT y sesiones duran 900 segundos por defecto.

## Consideraciones

El gateway es el único servicio publicado y es el responsable de validar las credenciales antes de añadir cabeceras internas de identidad. Para despliegues fuera de la red privada de Compose, añade TLS, secretos gestionados, límites de solicitudes y una red privada entre servicios. Redis Pub/Sub es efímero; las notificaciones recibidas se persisten en PostgreSQL, pero una caída del consumidor durante la publicación puede perder el evento. Para garantías de entrega durables, se debe complementar con un outbox o Redis Streams.
