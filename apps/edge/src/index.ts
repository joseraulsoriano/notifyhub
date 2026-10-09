import { Container, getRandom } from '@cloudflare/containers';

/**
 * La API NestJS corriendo en Cloudflare Containers. Es la misma imagen de `infra/docker/api.Dockerfile`;
 * aquí solo se le inyecta la configuración que valida `loadConfig()` al arrancar.
 */
export class ApiContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '15m';
  // Postgres (Neon) y Redis viven fuera de Cloudflare: el contenedor necesita salida a internet.
  enableInternet = true;

  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: 'production',
      PORT: String(this.defaultPort),
      LOG_LEVEL: env.LOG_LEVEL,
      DATABASE_URL: env.DATABASE_URL,
      REDIS_URL: env.REDIS_URL,
    };
  }

  override onError(error: unknown): never {
    console.error('ApiContainer falló', error);
    throw error;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    // La API no guarda estado en memoria (idempotencia y rate limit viven en Postgres y Redis),
    // así que cualquier instancia puede atender cualquier petición.
    const instance = await getRandom(env.API, Number(env.API_INSTANCES));
    return instance.fetch(request);
  },
} satisfies ExportedHandler<Env>;
