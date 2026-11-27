import type { Channel, Priority } from '@notifyhub/client';

/** Espejo de las reglas compiladas del despachador; mantener sincronizado con DEFAULT_ROUTING. */
export const FALLBACK_CHAINS: Record<Channel, Channel[]> = {
  EMAIL: ['SMS', 'PUSH'],
  SMS: ['PUSH', 'EMAIL'],
  PUSH: ['SMS', 'EMAIL'],
  WEBHOOK: ['EMAIL'],
};

export const STRATEGY_BY_PRIORITY: Record<Priority, string> = {
  HIGH: 'disponibilidad',
  MEDIUM: 'prioridad',
  LOW: 'costo',
};

/** Campo del destinatario que usa cada canal. */
export const CONTACT_FIELD = {
  EMAIL: 'email',
  SMS: 'phone',
  PUSH: 'deviceToken',
  WEBHOOK: 'webhookUrl',
} as const;
