// @ts-check
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [react()],
  // Dentro del iframe la barra de desarrollo de Astro tapa el contenido del shell.
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
