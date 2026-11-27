# TaskFlow (versión 2)

Segunda versión del proyecto, con otra arquitectura a propósito. NotifyHub (v1) es modular y serverless en
Cloudflare; TaskFlow es el Proyecto 4 del PDF: microservicios con API Gateway, JWT con roles y Redis.

| Pieza                                             | Dónde                                 | Ruta en el repo                       |
| ------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| api-gateway, auth, tasks, notifications, presence | Render (Docker, uno por `Dockerfile`) | `version-2/services/*`                |
| PostgreSQL y Redis (Key Value)                    | Render                                | `render.yaml`                         |
| Shell `taskflow-console`                          | Cloudflare Workers                    | `apps/taskflow-console`               |
| MFE proyectos / equipo                            | Cloudflare Workers                    | `apps/taskflow-mfe-projects`, `-team` |
| Kit compartido (cliente, sesión)                  | paquete del monorepo                  | `packages/taskflow-kit`               |

Las notificaciones usan el módulo centralizado de `@notifyhub/mfe-runtime` (bus por `postMessage`, bandeja en
el shell). El shell además abre el stream SSE del notification-service y convierte cada evento de Redis en un
aviso de la campana.

## Local

```bash
cd version-2 && cp .env.example .env   # JWT_SECRET, INTERNAL_TOKEN, BOOTSTRAP_ADMIN_*; CORS_ORIGINS con los 3 puertos
GATEWAY_PORT=18080 docker compose up --build -d
pnpm dev:taskflow                       # shell :4340, proyectos :4341, equipo :4342
```

## Producción

1. Render: Blueprint desde `render.yaml`. `BOOTSTRAP_ADMIN_PASSWORD` debe tener **al menos 10 caracteres**.
2. Cloudflare, con la URL pública del gateway:

```bash
export PUBLIC_TASKFLOW_API_URL=https://<gateway>.onrender.com
for a in mfe-projects mfe-team console; do pnpm --filter @taskflow/$a run deploy; done
```

3. `CORS_ORIGINS` del gateway debe listar los tres orígenes `*.workers.dev` (ya está en `render.yaml`).

## Bajarlo después de la entrega

- Render: borrar el Blueprint desde el panel (servicios, base de datos y Key Value).
- Cloudflare: `wrangler delete --name taskflow-console` (y `taskflow-mfe-projects`, `taskflow-mfe-team`).
