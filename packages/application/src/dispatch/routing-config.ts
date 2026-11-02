import type { Channel, Priority } from '@notifyhub/domain';
import type { StrategyName } from './strategies';

/** Misma información que config/routing.yaml; es el valor por defecto del despachador. */
export interface RoutingConfig {
  strategy: Record<Priority, StrategyName>;
  fallback: Record<Channel, Channel[]>;
  retry: { maxAttempts: number; baseMs: number; maxMs: number; jitter: boolean };
  /** Orden de proveedores para la estrategia "priority". */
  providerOrder: string[];
  /** Máximo global de envíos simultáneos por proveedor, compartido por las tres colas. */
  providerConcurrency: Record<string, number>;
  /** Concurrencia máxima de mensajes dentro de cada lote del consumidor. */
  batchConcurrency: number;
  /** Operaciones de proveedor tienen timeout menor que su concesión. */
  providerSendTimeoutMs: number;
  providerLeaseMs: number;
  /** Despacho completo: se renueva mientras espera y se recupera tras expirar si el Worker cae. */
  dispatchLeaseMs: number;
  /** Tiempo de espera en la cola global de proveedor antes de reintentar el mensaje. */
  providerWaitTimeoutMs: number;
  /** Umbral de inactividad para recuperar un despacho interrumpido en estado no terminal. */
  staleDispatchMs: number;
  /** El reintento de un mensaje cuyo despacho sigue activo no retiene el lote. */
  busyDispatchRetrySeconds: number;
}

export const DEFAULT_ROUTING: RoutingConfig = {
  strategy: { HIGH: 'availability', MEDIUM: 'priority', LOW: 'cost' },
  fallback: {
    EMAIL: ['SMS', 'PUSH'],
    SMS: ['PUSH', 'EMAIL'],
    PUSH: ['SMS', 'EMAIL'],
    WEBHOOK: ['EMAIL'],
  },
  retry: { maxAttempts: 3, baseMs: 500, maxMs: 10_000, jitter: true },
  providerOrder: ['sendgrid', 'twilio', 'fcm', 'webhook'],
  providerConcurrency: { sendgrid: 3, twilio: 2, fcm: 5, webhook: 2 },
  batchConcurrency: 3,
  providerSendTimeoutMs: 30_000,
  providerLeaseMs: 45_000,
  dispatchLeaseMs: 90_000,
  providerWaitTimeoutMs: 120_000,
  staleDispatchMs: 120_000,
  busyDispatchRetrySeconds: 30,
};
