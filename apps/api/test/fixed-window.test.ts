import { describe, expect, it } from 'vitest';
import { hitFixedWindow } from '../src/infra/fixed-window';

describe('hitFixedWindow', () => {
  it('permite hasta el límite dentro de la ventana y luego bloquea', () => {
    let state;
    const results = [];
    for (let i = 0; i < 3; i++) {
      const hit = hitFixedWindow(state, 1_000, 2, 60);
      state = hit.state;
      results.push(hit.result);
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([1, 0, 0]);
    expect(results[2]?.resetSeconds).toBe(60);
  });

  it('reinicia el contador cuando la ventana vence', () => {
    const first = hitFixedWindow(undefined, 0, 1, 60);
    const blocked = hitFixedWindow(first.state, 30_000, 1, 60);
    const next = hitFixedWindow(blocked.state, 60_000, 1, 60);

    expect(blocked.result).toMatchObject({ allowed: false, resetSeconds: 30 });
    expect(next.result).toMatchObject({ allowed: true, remaining: 0, resetSeconds: 60 });
  });
});
