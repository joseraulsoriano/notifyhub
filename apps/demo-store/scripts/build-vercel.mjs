// Empaqueta la tienda para Vercel: una sola función con el SDK incluido, sin depender del monorepo.
// Uso: pnpm --filter @notifyhub/demo-store build:vercel && vercel deploy --prod --cwd apps/demo-store/vercel
import { build } from 'esbuild';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

await build({
  entryPoints: [`${root}src/vercel.ts`],
  outfile: `${root}vercel/api/index.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
});
console.log('Listo: vercel/api/index.js');
