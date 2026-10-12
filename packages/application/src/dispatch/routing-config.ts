import type { Channel, Priority } from '@notifyhub/domain';
import type { StrategyName } from './strategies';

/** Misma información que config/routing.yaml; es el valor por defecto del despachador. */
export interface RoutingConfig {
  strategy: Record<Priority, StrategyName>;
  fallback: Record<Channel, Channel[]>;
  retry: { maxAttempts: number; baseMs: number; maxMs: number; jitter: boolean };
  /** Orden de proveedores para la estrategia "priority". */
  providerOrder: string[];
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
};
