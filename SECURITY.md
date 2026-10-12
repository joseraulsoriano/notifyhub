# Seguridad

## Cómo reportar una vulnerabilidad

No abras un issue público. Escribe al equipo por un canal privado (por ejemplo, el correo de la persona que mantiene el repositorio en su perfil de GitHub) con:

- qué encontraste y qué impacto tiene,
- los pasos para reproducirlo,
- la versión o el commit afectados.

Responderemos en un plazo razonable y te avisaremos cuando esté corregido.

## Modelo de seguridad en una página

- **API key por cliente.** Se guarda solo su hash SHA-256 y se envía en `X-API-Key`. Hay límite de solicitudes por cliente.
- **Datos personales.** Las respuestas de lista y las notificaciones en la consola muestran el contacto **enmascarado**. La bitácora no guarda el cuerpo de los mensajes.
- **Proveedores.** `PATCH /v1/providers/{code}` afecta a todos los clientes: solo lo permiten los de `PROVIDER_ADMIN_CLIENTS` (vacío = nadie).
- **CORS.** Sin `CORS_ALLOWED_ORIGINS` la API no responde a navegadores de otros orígenes.
- **Consola web.** No lleva ninguna API key en el código: se pega en el diálogo «Conectar» y vive solo en `sessionStorage` de esa pestaña. Úsala con llaves de confianza; cualquier script de la página podría leerla.
- **Proveedores simulados.** El despachador de esta versión no envía mensajes reales (SendGrid, Twilio y FCM son simulados). Antes de conectar proveedores reales hay que decidir cómo se guardan sus credenciales (Workers Secrets).

## Secretos

No subas llaves, tokens ni cadenas de conexión. `.env`, `.dev.vars` y `.wrangler` están ignorados por git. Si publicaste un secreto por error, rótalo de inmediato: borrarlo del historial no lo vuelve seguro.
