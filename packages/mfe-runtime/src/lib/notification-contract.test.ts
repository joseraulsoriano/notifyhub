import { describe, expect, it } from 'vitest';
import { isExpired, isInternalPath, parseNotification } from './notification-contract';

const src = { sourceMfe: 'mfe-operations', now: 1_000 };

describe('contrato de notificaciones', () => {
  it('normaliza una notificación válida y aplica valores por defecto', () => {
    const item = parseNotification({ title: '  Guardado  ' }, src);
    expect(item).toMatchObject({ severity: 'info', title: 'Guardado', ttl: 3600, createdAt: 1_000 });
    expect(item?.sourceMfe).toBe('mfe-operations');
    expect(item?.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('rechaza lo que no cumple el contrato', () => {
    for (const bad of [
      null,
      'texto',
      [],
      {},
      { title: '' },
      { title: 'x'.repeat(121) },
      { title: 'a', severity: 'critical' },
      { title: 'a', message: 42 },
      { title: 'a', ttl: -1 },
      { title: 'a', ttl: 90_000 },
      { title: 'a', ttl: Number.NaN },
    ])
      expect(parseNotification(bad, src)).toBeNull();
  });

  it('el emisor no puede fijar sourceMfe: lo pone el shell', () => {
    expect(parseNotification({ title: 'a', sourceMfe: 'otro' }, src)?.sourceMfe).toBe('mfe-operations');
    expect(parseNotification({ title: 'a' }, { sourceMfe: 'Mal Nombre!' })?.sourceMfe).toBe('desconocido');
  });

  it('solo acepta rutas internas como actionUrl', () => {
    expect(isInternalPath('/notificaciones?id=1')).toBe(true);
    for (const bad of ['https://evil.test', '//evil.test', 'javascript:alert(1)', '/a\\b', '/a\nb', 7])
      expect(isInternalPath(bad)).toBe(false);
    expect(parseNotification({ title: 'a', actionUrl: 'https://evil.test' }, src)?.actionUrl).toBeUndefined();
    expect(parseNotification({ title: 'a', actionUrl: '/bitacora' }, src)?.actionUrl).toBe('/bitacora');
  });

  it('ttl 0 no expira; ttl > 0 expira a su tiempo', () => {
    const base = parseNotification({ title: 'a', ttl: 10 }, src)!;
    expect(isExpired(base, 1_000 + 9_999)).toBe(false);
    expect(isExpired(base, 1_000 + 10_000)).toBe(true);
    expect(isExpired({ ...base, ttl: 0 }, 9e12)).toBe(false);
  });
});
