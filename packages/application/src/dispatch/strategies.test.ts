import type { NotificationRequest, Provider } from '@notifyhub/domain';
import { describe, expect, it } from 'vitest';
import { backoffMs } from './retry-policy';
import { FallbackPolicy } from './fallback-policy';
import { DEFAULT_ROUTING } from './routing-config';
import { AvailabilityStrategy, CostStrategy, PriorityStrategy, strategyFor } from './strategies';

const request = {} as NotificationRequest;
const p = (code: string, over: Partial<Provider> = {}): Provider => ({
  code,
  channel: 'SMS',
  costPerMessage: 0.01,
  reliabilityScore: 90,
  health: 'UP',
  enabled: true,
  ...over,
});

describe('estrategias de selección de proveedor', () => {
  const cheap = p('barato', { costPerMessage: 0.001, reliabilityScore: 80, health: 'DEGRADED' });
  const reliable = p('confiable', { costPerMessage: 0.02, reliabilityScore: 99 });
  const down = p('caido', { costPerMessage: 0.0005, reliabilityScore: 99, health: 'DOWN' });

  it('costo: el más barato primero', () => {
    expect(new CostStrategy().rank(request, [reliable, cheap, down]).map((x) => x.code)).toEqual([
      'caido',
      'barato',
      'confiable',
    ]);
  });

  it('disponibilidad: UP antes que DEGRADED antes que DOWN', () => {
    expect(new AvailabilityStrategy().rank(request, [down, cheap, reliable]).map((x) => x.code)).toEqual([
      'confiable',
      'barato',
      'caido',
    ]);
  });

  it('prioridad: sigue el orden configurado y deja al final los no listados', () => {
    const rank = new PriorityStrategy(['confiable', 'barato']).rank(request, [down, cheap, reliable]);
    expect(rank.map((x) => x.code)).toEqual(['confiable', 'barato', 'caido']);
  });

  it('no modifica el arreglo de entrada', () => {
    const input = [reliable, cheap];
    new CostStrategy().rank(request, input);
    expect(input.map((x) => x.code)).toEqual(['confiable', 'barato']);
  });

  it('strategyFor usa la estrategia por nombre', () => {
    expect(strategyFor(DEFAULT_ROUTING.strategy.HIGH).name).toBe('availability');
    expect(strategyFor(DEFAULT_ROUTING.strategy.LOW).name).toBe('cost');
    expect(strategyFor(DEFAULT_ROUTING.strategy.MEDIUM).name).toBe('priority');
  });
});

describe('FallbackPolicy', () => {
  const policy = new FallbackPolicy(DEFAULT_ROUTING.fallback);

  it('el canal preferido va primero y le siguen los de la cadena con dato de contacto', () => {
    const all = { email: 'a@b.co', phone: '+5215512345678', deviceToken: 'fcm:APA91bHe41a0000' };
    expect(policy.channelsFor(all, 'EMAIL')).toEqual(['EMAIL', 'SMS', 'PUSH']);
    expect(policy.channelsFor(all, 'PUSH')).toEqual(['PUSH', 'SMS', 'EMAIL']);
  });

  it('omite los canales sin dato de contacto', () => {
    expect(policy.channelsFor({ email: 'a@b.co' }, 'EMAIL')).toEqual(['EMAIL']);
    expect(policy.channelsFor({ email: 'a@b.co', phone: '+5215512345678' }, 'WEBHOOK')).toEqual([
      'WEBHOOK',
      'EMAIL',
    ]);
  });
});

describe('backoffMs', () => {
  const config = { maxAttempts: 5, baseMs: 500, maxMs: 4000, jitter: false };

  it('crece de forma exponencial hasta el tope', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffMs(config, n))).toEqual([500, 1000, 2000, 4000, 4000]);
  });

  it('con jitter queda entre la mitad y el valor completo', () => {
    expect(backoffMs({ ...config, jitter: true }, 2, () => 0)).toBe(500);
    expect(backoffMs({ ...config, jitter: true }, 2, () => 1)).toBe(1000);
  });
});
