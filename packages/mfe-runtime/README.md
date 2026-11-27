# @notifyhub/mfe-runtime

Kit que comparten el shell (`apps/console`) y los cuatro microfrontends (`apps/mfe-*`). Gracias a él, todos se ven y
se comportan como un solo producto, aunque cada uno se compile y despliegue por separado.

Se consume como código fuente (sin paso de build): Astro y Vite lo compilan dentro de cada app.

## Qué trae

| Import                                     | Contenido                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `@notifyhub/mfe-runtime/ui/<componente>`   | Primitivas shadcn/Base UI: `button`, `card`, `table`, `sheet`, `sidebar`…                        |
| `@notifyhub/mfe-runtime/styles.css`        | Tailwind, tokens de `@notifyhub/ui` y estilos base                                               |
| `@notifyhub/mfe-runtime/MfeDocument.astro` | Documento HTML común: idioma, viewport y tipografías                                             |
| `@notifyhub/mfe-runtime`                   | `MfeApp`, `Page`, `PageHeader`, `FilterSelect`, panel de detalle, conexión, cliente demo, puente |

## Usarlo en un microfrontend

```astro
---
// src/pages/index.astro
import '../styles/app.css'; // @import '@notifyhub/mfe-runtime/styles.css'; @source '../';
import MfeDocument from '@notifyhub/mfe-runtime/MfeDocument.astro';
import { DashboardApp } from '../App';
---

<MfeDocument title="Resumen">
  <DashboardApp client:load />
</MfeDocument>
```

```tsx
// src/App.tsx
import { MfeApp } from '@notifyhub/mfe-runtime';
import { Dashboard } from './views/DashboardPage';

export function DashboardApp() {
  return (
    <MfeApp title="Resumen">
      <Dashboard />
    </MfeApp>
  );
}
```

Cada app declara su propia hoja `src/styles/app.css` con `@source '../'` para que Tailwind genere las clases de sus
pantallas además de las del kit.

`MfeApp` detecta si corre dentro del shell. Embebido, solo pinta el contenido, recibe la conexión y reporta su alto.
Suelto, pinta una cabecera mínima con el logo y el botón «Conectar».

## Enlaces entre pantallas

Las rutas son siempre del shell. Usa `shellLink('/nueva')` en un `<a>` (abre en `_top`) y `navigateShell(path)` para
navegar desde código. Nunca enlaces a rutas internas del MFE.

## Puente con el shell

El contrato de mensajes está en `src/lib/bridge.ts` y se describe en
[Arquitectura actual](../../docs/arquitectura-actual.md#cómo-se-componen-el-shell-y-los-microfrontends). En resumen:

- la conexión (y la API key) llega por `postMessage`, nunca en la URL;
- en modo demo, los MFE embebidos usan el cliente demo del shell. Las llamadas viajan por `postMessage` y solo se
  aceptan los métodos de `RPC_METHODS`;
- cada mensaje se valida por ventana y origen en ambos lados.

## Pruebas

```bash
pnpm --filter @notifyhub/mfe-runtime test       # cliente demo
pnpm --filter @notifyhub/mfe-runtime typecheck
```
