import { describe, expect, it } from 'vitest';
import { InvalidStatusTransitionError } from './errors';
import { assertTransition, canTransition, isTerminal } from './status-machine';

describe('máquina de estados de la notificación', () => {
  it('sigue el flujo feliz RECEIVED → QUEUED → SENDING → SENT → DELIVERED', () => {
    expect(canTransition('RECEIVED', 'QUEUED')).toBe(true);
    expect(canTransition('QUEUED', 'SENDING')).toBe(true);
    expect(canTransition('SENDING', 'SENT')).toBe(true);
    expect(canTransition('SENT', 'DELIVERED')).toBe(true);
  });

  it('permite reintento y fallback', () => {
    expect(canTransition('SENDING', 'RETRYING')).toBe(true);
    expect(canTransition('RETRYING', 'FALLBACK')).toBe(true);
    expect(canTransition('FALLBACK', 'SENDING')).toBe(true);
    expect(canTransition('FALLBACK', 'FAILED')).toBe(true);
  });

  it('rechaza saltos que no están en el diagrama', () => {
    expect(canTransition('RECEIVED', 'SENT')).toBe(false);
    expect(() => assertTransition('FAILED', 'SENDING')).toThrow(InvalidStatusTransitionError);
  });

  it('identifica los estados finales', () => {
    expect(isTerminal('FAILED')).toBe(true);
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('QUEUED')).toBe(false);
  });
});
