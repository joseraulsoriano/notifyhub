import { describe, expect, it } from 'vitest';
import { maskRecipient } from './mask';

describe('maskRecipient', () => {
  it('oculta el dato personal de cada canal', () => {
    expect(maskRecipient({ email: 'maria@example.com' }, 'EMAIL')).toBe('m***@example.com');
    expect(maskRecipient({ phone: '+5215512345678' }, 'SMS')).toBe('+52 ****-5678');
    expect(maskRecipient({ deviceToken: 'APA91bHe41a0000' }, 'PUSH')).toBe('APA9••••0000');
    expect(maskRecipient({ webhookUrl: 'https://erp.cliente.mx/hook/secreto?t=1' }, 'WEBHOOK')).toBe(
      'https://erp.cliente.mx/…',
    );
  });

  it('devuelve cadena vacía si falta el dato', () => {
    expect(maskRecipient({}, 'EMAIL')).toBe('');
    expect(maskRecipient({}, 'SMS')).toBe('');
    expect(maskRecipient({}, 'WEBHOOK')).toBe('');
  });
});
