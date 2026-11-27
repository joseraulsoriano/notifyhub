import { describe, expect, it } from 'vitest';
import { bucketize, outcomeOf } from './activity';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const item = (minAgo: number, status: string, usedFallback = false) =>
  ({ createdAt: at(minAgo), status, usedFallback }) as Parameters<typeof bucketize>[0][number];

describe('outcomeOf', () => {
  it('clasifica el resultado', () => {
    expect(outcomeOf({ status: 'DELIVERED', usedFallback: false })).toBe('ok');
    expect(outcomeOf({ status: 'DELIVERED', usedFallback: true })).toBe('fallback');
    expect(outcomeOf({ status: 'SENT', usedFallback: false })).toBe('ok');
    expect(outcomeOf({ status: 'FAILED', usedFallback: true })).toBe('failed');
    for (const status of ['RECEIVED', 'QUEUED', 'SENDING', 'RETRYING', 'FALLBACK'])
      expect(outcomeOf({ status, usedFallback: false } as never)).toBe('pending');
  });
});

describe('bucketize', () => {
  it('sin datos devuelve 24 intervalos vacíos de una ventana mínima de 10 min', () => {
    const b = bucketize([], NOW);
    expect(b).toHaveLength(24);
    expect(b.every((x) => x.total === 0)).toBe(true);
    expect(b[23]!.end - b[0]!.start).toBe(10 * 60_000);
  });

  it('cuenta cada notificación en un solo intervalo y por resultado', () => {
    const b = bucketize(
      [item(1, 'DELIVERED'), item(1, 'FAILED'), item(8, 'DELIVERED', true), item(9, 'SENDING')],
      NOW,
    );
    expect(b.reduce((s, x) => s + x.total, 0)).toBe(4);
    const sum = (k: 'ok' | 'fallback' | 'failed' | 'pending') => b.reduce((s, x) => s + x.counts[k], 0);
    expect([sum('ok'), sum('fallback'), sum('failed'), sum('pending')]).toEqual([1, 1, 1, 1]);
  });

  it('la ventana crece con la notificación más antigua y se limita a 24 h', () => {
    const wide = bucketize([item(120, 'DELIVERED')], NOW);
    expect(wide[23]!.end - wide[0]!.start).toBeGreaterThan(119 * 60_000);
    const capped = bucketize([item(60 * 24 * 7, 'DELIVERED')], NOW);
    expect(capped[23]!.end - capped[0]!.start).toBe(24 * 3_600_000);
    expect(capped.reduce((s, x) => s + x.total, 0)).toBe(0); // fuera de la ventana
  });

  it('ignora fechas inválidas y futuras', () => {
    const b = bucketize(
      [
        { createdAt: 'no-es-fecha', status: 'DELIVERED', usedFallback: false } as never,
        item(-5, 'DELIVERED'),
      ],
      NOW,
    );
    expect(b.reduce((s, x) => s + x.total, 0)).toBe(0);
  });
});
