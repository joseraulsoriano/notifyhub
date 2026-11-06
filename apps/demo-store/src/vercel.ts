import { handleRequest } from './app';

// Sin @types/node: este archivo solo corre en Vercel (Node.js) y únicamente lee variables de entorno.
declare const process: { env: Record<string, string | undefined> };

/**
 * Entrada para Vercel Functions (Node.js). `scripts/build-vercel.mjs` la empaqueta con el SDK
 * en `vercel/api/index.js`; `vercel/vercel.json` manda todas las rutas a esta función.
 */
const config = () => ({
  STORE_NAME: process.env.STORE_NAME ?? 'Tienda Demo',
  NOTIFYHUB_API_URL: process.env.NOTIFYHUB_API_URL ?? '',
  NOTIFYHUB_API_KEY: process.env.NOTIFYHUB_API_KEY,
  CONSOLE_URL: process.env.CONSOLE_URL ?? '',
});

export const GET = (request: Request) => handleRequest(request, config());
export const POST = (request: Request) => handleRequest(request, config());
