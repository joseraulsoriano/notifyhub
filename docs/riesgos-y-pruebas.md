# Matriz de riesgos y estrategia de pruebas

NH-9 (SCRUM-17) · Responsable: Andreea Margarita Maldonado Morales · Borrador para revisión

## Matriz de riesgos

Escala: probabilidad e impacto de 1 (bajo) a 3 (alto). Exposición = P × I.

| #   | Riesgo                                                                           | P   | I   | Exp. | Mitigación                                                                                                       | Disparador / responsable                                         |
| --- | -------------------------------------------------------------------------------- | --- | --- | ---- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| R1  | Un proveedor (Twilio, SendGrid, FCM) cambia su API o bloquea la cuenta de prueba | 2   | 3   | 6    | Adaptadores aislados (Adapter + Factory Method); WireMock en CI; cuentas sandbox registradas desde S1            | Error 4xx inesperado en la prueba de humo · AMM                  |
| R2  | Envíos duplicados por reintentos del cliente o del worker                        | 2   | 3   | 6    | `Idempotency-Key` con índice único; `jobId = notificationId` en BullMQ; suscriptores idempotentes                | Dos `delivery_attempt` exitosos para la misma notificación · JRS |
| R3  | Pérdida de notificaciones si Redis cae entre persistir y encolar                 | 1   | 3   | 3    | Persistir antes de encolar; barrido de `RECEIVED` antiguas en el despachador; Redis con AOF                      | Notificaciones en `RECEIVED` por más de 1 min · JRS              |
| R4  | Pérdida de eventos de estado (RF5)                                               | 1   | 3   | 3    | Outbox transaccional; relay con reintentos                                                                       | `outbox_event` sin publicar por más de 1 min · JRS               |
| R5  | Costos de SMS en pruebas                                                         | 2   | 2   | 4    | Números verificados de Twilio; tope de gasto; WireMock por defecto en local y CI                                 | Factura > USD 5 · JRS                                            |
| R6  | Exposición de datos personales en bitácora y logs                                | 2   | 3   | 6    | Enmascarado de correo y teléfono (NH-32); logs sin cuerpo del mensaje; retención de 12 meses                     | Revisión de la bitácora en cada sprint · AMM                     |
| R7  | Alcance mayor que la capacidad (2 personas, 142 SP en 10 semanas)                | 2   | 2   | 4    | Prioridad alta primero; S4 tiene margen; recortar NH-36 o NH-40 si hace falta                                    | Velocidad < 24 SP en un sprint · JRS                             |
| R8  | Curva de aprendizaje de NestJS, BullMQ o Prisma                                  | 2   | 1   | 2    | Plantilla de S1 con ejemplos y pruebas; revisión cruzada en cada PR                                              | Historia bloqueada > 2 días · ambos                              |
| R9  | Falla del fallback en cascada (todos los canales caen)                           | 1   | 2   | 2    | Circuit breaker por proveedor; estado `FAILED` explícito y evento para alertar                                   | Tasa de `FAILED` > 2 % · AMM                                     |
| R10 | Disponibilidad de una de las dos personas (exámenes, otras materias)             | 2   | 2   | 4    | Historias pequeñas (≤ 5 SP); documentación en el repo; las dos personas conocen cada módulo por revisión cruzada | Sprint con < 50 % de avance a la mitad · ambos                   |

**Riesgos prioritarios (exposición 6):** R1, R2 y R6. Cada uno tiene una historia que lo cubre: R1 en NH-21 a NH-24,
R2 en NH-15 (ya implementada), R6 en NH-32.

## Estrategia de pruebas

Pirámide con mayor peso en pruebas rápidas de dominio. Todo corre en CI en cada pull request.

| Nivel            | Herramienta                                     | Qué cubre                                                                                   | Dónde                         | Meta                                                                        |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Unitarias        | Vitest                                          | Máquina de estados, casos de uso, factorías, estrategias, política de fallback, enmascarado | `packages/*/src/**/*.test.ts` | Cobertura ≥ 80 % en `domain`, `application`, `routing`, `providers` (NH-38) |
| Componente (API) | Vitest + Supertest + adaptadores en memoria     | Contrato HTTP: validación, 401, 409, 429, idempotencia, aislamiento entre clientes          | `apps/*/test`                 | Cada código de respuesta de `openapi.yaml` tiene una prueba                 |
| Integración      | Testcontainers (Postgres, Redis) + WireMock     | Repositorios Prisma, colas BullMQ, adaptadores de proveedores con éxito, 5xx y timeout      | `tests/integration` (NH-39)   | Escenarios de éxito, reintento y fallback                                   |
| Humo             | `tests/e2e/smoke.sh` en CI con servicios reales | Arranque, migraciones, POST → GET, idempotencia y 401                                       | Job `smoke` de CI             | Bloquea el merge si falla                                                   |
| Carga            | k6                                              | 1,000 notificaciones/min; p95 de aceptación < 200 ms; caída de un proveedor                 | `tests/load` (NH-40)          | Antes de la entrega final                                                   |
| Contrato         | Redocly CLI                                     | `docs/api/openapi.yaml` válido                                                              | CI (Sprint 2)                 | Sin errores                                                                 |

**Datos de prueba:** números y correos ficticios (`example.com`, rango `+1500555xxxx` de Twilio); ningún dato real en
fixtures.

**Definition of Done de una historia:** criterios de aceptación cubiertos por al menos una prueba automatizada, CI en
verde, revisión de la otra persona y documentación actualizada (`openapi.yaml`, ADR o README según aplique).

### Estado al 9 de octubre de 2026

- 23 pruebas automatizadas en verde: 4 de la máquina de estados, 6 del caso de uso de recepción, 2 de configuración y 11 de la API.
- La prueba de humo pasó contra Postgres 16 y Redis 7 reales (Docker Compose).
