import { handleRequest, type StoreConfig } from './app';

/** Secreto: no está en wrangler.jsonc, así que `wrangler types` no lo genera (y así no depende de .dev.vars). */
type StoreEnv = Env & StoreConfig;

/** Entrada para Cloudflare Workers (`wrangler dev`, la demo local). */
export default {
  fetch: (request, env: StoreEnv) => handleRequest(request, env),
} satisfies ExportedHandler<StoreEnv>;
