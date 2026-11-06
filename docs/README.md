# Documentación de NotifyHub

## Empieza aquí

- [Explicación del proyecto](explicacion-del-proyecto.md): resumen para presentar NotifyHub y su tienda de demostración.
- [Guía del proyecto](guia-del-proyecto.md): configuración local desde cero, recorrido de una solicitud, arquitectura,
  concurrencia y paso a producción.
- [Contrato HTTP](api/openapi.yaml): rutas, cuerpos de solicitud y respuestas de la API.

## Arquitectura y decisiones

- [ADRs](adr/README.md): decisiones técnicas y alternativas.
- [Diagramas](diagrams/): contexto, contenedores, clases, secuencia de envío, estados y despliegue.
- [Despliegue](despliegue.md): preparación de Cloudflare/Neon, migraciones y publicación.
- [Cola, Cloudflare y por qué no Docker ni Kubernetes](cola-y-cloudflare.md): cómo viaja una notificación, con cola,
  asíncrono o síncrono, y por qué se eligió Cloudflare.
- [Tienda de demostración](../apps/demo-store/README.md): NotifyHub conectado a un e-commerce (Vercel) y guion de la demo.

## Seguimiento del proyecto

- [Avance por sprint e historias](avance.md)
- [Riesgos y pruebas](riesgos-y-pruebas.md)
- [Presentación](presentacion/): materiales del proyecto
