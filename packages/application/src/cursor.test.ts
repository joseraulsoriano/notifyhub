import { InvalidCursorError } from '@notifyhub/domain';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor de paginación', () => {
  const cursor = {
    createdAt: new Date('2026-10-12T15:00:01.234Z'),
    id: '3f1c0a52-8e5a-4d10-9a0a-1f7d2b3c4d5e',
  };

  it('ida y vuelta sin pérdida', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('es seguro para URL', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(['', 'basura', btoa('2026-10-12|no-es-uuid'), btoa('fecha|3f1c0a52-8e5a-4d10-9a0a-1f7d2b3c4d5e')])(
    'rechaza %j',
    (value) => {
      expect(() => decodeCursor(value)).toThrow(InvalidCursorError);
    },
  );
});
