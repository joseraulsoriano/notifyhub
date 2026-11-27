import { describe, expect, it } from 'vitest';
import { ApiError, parseSse } from './api';

describe('parseSse', () => {
  it('separa eventos completos y conserva el resto sin cerrar', () => {
    const { events, rest } = parseSse(
      'id: 1\nevent: notification\ndata: {"a":1}\n\n: keepalive\n\nevent: notification\ndata: {"b"',
    );
    expect(events).toEqual([{ event: 'notification', data: '{"a":1}' }]);
    expect(rest).toBe('event: notification\ndata: {"b"');
  });

  it('une varias líneas data y usa "message" por defecto', () => {
    expect(parseSse('data: uno\ndata: dos\n\n').events).toEqual([{ event: 'message', data: 'uno\ndos' }]);
  });
});

describe('ApiError', () => {
  it('traduce los códigos del gateway a mensajes en español', () => {
    expect(new ApiError(401, 'invalid_credentials').message).toBe('Correo o contraseña incorrectos.');
    expect(new ApiError(500, 'otro_codigo').message).toBe('otro_codigo');
  });
});
