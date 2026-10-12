import type { Channel } from './enums';

export const PROVIDER_HEALTHS = ['UP', 'DEGRADED', 'DOWN'] as const;
export type ProviderHealth = (typeof PROVIDER_HEALTHS)[number];

/** Proveedor de un canal (SendGrid, Twilio, FCM, webhook). Columnas de la tabla `provider`. */
export interface Provider {
  code: string;
  channel: Channel;
  costPerMessage: number;
  /** 0 a 100. */
  reliabilityScore: number;
  health: ProviderHealth;
  enabled: boolean;
}
