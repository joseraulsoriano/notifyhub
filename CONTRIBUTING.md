# Cómo trabajamos

- **Una rama corta por historia**, desde `main`, con la clave de Jira: `SCRUM-22-adaptador-sendgrid`.
- **Pull request con revisión de la otra persona.** CI (lint, tipos, pruebas, humo e imagen) debe estar en verde.
- **Conventional Commits** con la clave de Jira al inicio del asunto, para que Jira enlace el trabajo:
  `feat(api): SCRUM-22 POST /v1/notifications`. Husky valida el formato en cada commit.
- **Definition of Done:** criterios de aceptación cubiertos por pruebas, CI en verde, revisión aprobada y
  documentación al día (`docs/api/openapi.yaml`, ADR o README).
- Las claves `NH-n` de la planeación equivalen a `SCRUM-(n+8)` en Jira (NH-14 = SCRUM-22).
- **Colaboración externa:** abre un issue para proponer el cambio antes de enviar un pull request; el equipo le asigna la clave de Jira
  que va en la rama y en los commits. Al contribuir aceptas que tu aporte se publica bajo la licencia [MIT](LICENSE).
