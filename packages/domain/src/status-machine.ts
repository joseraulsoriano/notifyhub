import type { NotificationStatus } from './enums';
import { InvalidStatusTransitionError } from './errors';

const TRANSITIONS: Record<NotificationStatus, readonly NotificationStatus[]> = {
  RECEIVED: ['QUEUED'],
  QUEUED: ['SENDING'],
  SENDING: ['SENT', 'RETRYING', 'FALLBACK'],
  RETRYING: ['SENDING', 'FALLBACK'],
  FALLBACK: ['SENDING', 'FAILED'],
  SENT: ['DELIVERED'],
  DELIVERED: [],
  FAILED: [],
};

export function canTransition(from: NotificationStatus, to: NotificationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: NotificationStatus, to: NotificationStatus): void {
  if (!canTransition(from, to)) throw new InvalidStatusTransitionError(from, to);
}

export function isTerminal(status: NotificationStatus): boolean {
  return TRANSITIONS[status].length === 0 || status === 'SENT';
}
