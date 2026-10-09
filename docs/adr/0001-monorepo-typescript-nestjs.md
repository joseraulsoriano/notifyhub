# ADR-001 · Monorepo TypeScript con NestJS y arquitectura hexagonal

- **Estado:** aceptada · 2026-09-30 · NH-2 (SCRUM-10)
- **Decisores:** José Raúl Soriano, Andreea Margarita Maldonado Morales

## Contexto

El servicio debe demostrar Factory Method, Strategy y Observer de forma explícita y servir como plantilla para otros
proyectos. Hay tres procesos (API, despachador, relay de eventos) que comparten dominio.

## Decisión

- **TypeScript estricto en Node.js 22 LTS**, con **NestJS 11** solo en `apps/*`.
- **pnpm workspaces + Turborepo**: `packages/domain` (sin dependencias), `packages/application` (casos de uso y
  puertos, solo depende de `domain`) y adaptadores (`persistence`, `providers`, `routing`, `events`…).
- Inyección por **tokens explícitos** (`@Inject(TOKEN)`), sin `emitDecoratorMetadata`: así las pruebas corren con
  Vitest/esbuild sin plugins y los casos de uso no dependen del framework.
- Las reglas de dependencia se hacen cumplir con `no-restricted-imports` en ESLint.

## Consecuencias

- Los patrones GoF viven en clases de TypeScript puro, fáciles de probar y de explicar en clase.
- Agregar un proceso nuevo (por ejemplo, el despachador del Sprint 2) es otro `apps/*` que reutiliza los paquetes.
- Costo: más archivos de configuración que un proyecto de un solo paquete.

**Alternativas descartadas:** Express/Fastify sin estructura (DI manual), Nx (más pesado), Java/Spring (el equipo
avanza más rápido en TypeScript).
