import { describe, expect, it } from 'vitest';
import { sanitize, withinLimit } from './sanitize';

const ok = {
  topic: 'taskflow-abc123def456',
  title: 'Te asignaron una tarea',
  message: 'Preparar la demo (Pendiente)',
};

describe('sanitize', () => {
  it('acepta un aviso válido y conserva solo los campos permitidos', () => {
    expect(sanitize({ ...ok, tags: ['clipboard'], click: 'https://evil.test', extra: 1 })).toEqual({
      ...ok,
      tags: ['clipboard'],
    });
  });
  it('rechaza temas ajenos al proyecto y formas inválidas', () => {
    for (const bad of [
      null,
      'x',
      [],
      {},
      { ...ok, topic: 'otro-tema-cualquiera' },
      { ...ok, topic: 'taskflow-' },
      { ...ok, topic: 'taskflow-a b c d e' },
    ])
      expect(sanitize(bad)).toBeNull();
  });
  it('limita título, mensaje y etiquetas', () => {
    expect(sanitize({ ...ok, title: '' })).toBeNull();
    expect(sanitize({ ...ok, title: 'x'.repeat(121) })).toBeNull();
    expect(sanitize({ ...ok, message: 'x'.repeat(301) })).toBeNull();
    expect(sanitize({ ...ok, tags: ['a', 'b', 'c', 'd'] })).toBeNull();
    expect(sanitize({ ...ok, tags: ['Mayúscula!'] })).toBeNull();
  });
  it('limita el tamaño del cuerpo', () => {
    expect(withinLimit(2048)).toBe(true);
    expect(withinLimit(2049)).toBe(false);
  });
});
