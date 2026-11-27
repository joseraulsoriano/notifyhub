import { defineConfig } from 'vitest/config';

// En Workers wrangler importa los .yaml como texto; aquí hacemos lo mismo para las pruebas.
export default defineConfig({
  plugins: [
    {
      name: 'yaml-como-texto',
      transform(code, id) {
        if (id.endsWith('.yaml')) return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
});
