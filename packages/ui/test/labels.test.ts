import { describe, expect, it } from 'vitest';
import { dayLabel, formatAgo } from '../src/labels';
import { NOW } from './fixtures';

describe('formatAgo', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  it.each([
    [10_000, 'ahora'],
    [5 * 60_000, 'hace 5 min'],
    [3 * 3_600_000, 'hace 3 h'],
    [30 * 3_600_000, 'ayer'],
  ])('%d ms → %s', (ms, expected) => {
    expect(formatAgo(ago(ms), NOW)).toBe(expected);
  });
});

describe('dayLabel', () => {
  it('agrupa por día calendario', () => {
    expect(dayLabel('2026-10-12T01:00:00', new Date('2026-10-12T23:00:00'))).toBe('Hoy');
    expect(dayLabel('2026-10-11T23:59:00', new Date('2026-10-12T00:10:00'))).toBe('Ayer');
    expect(dayLabel('2026-10-05T12:00:00', new Date('2026-10-12T12:00:00'))).toMatch(/octubre/);
  });
});
