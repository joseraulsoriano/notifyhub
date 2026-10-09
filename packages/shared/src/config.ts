import { z } from 'zod';

/**
 * Variables de texto del Worker (`vars` en wrangler.jsonc). Postgres y las colas llegan como bindings
 * (Hyperdrive y Queues), así que no pasan por aquí.
 */
const ConfigSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Límite por defecto para clientes sin rate_limit_per_min propio. */
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/** Valida la configuración al recibir la primera petición; si algo falla, el mensaje dice qué variable. */
export function loadConfig(env: object): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }
  return parsed.data;
}
