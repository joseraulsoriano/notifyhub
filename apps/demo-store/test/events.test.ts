import { describe, expect, it } from 'vitest';
import { buildNotification, orderTotal, parseEventRequest, type Customer, type Order } from '../src/events';

const order: Order = {
  id: 'PED-ABC123',
  items: [
    { name: 'Café', quantity: 2, price: 189 },
    { name: 'Taza', quantity: 1, price: 249 },
  ],
};
const customer: Customer = {
  name: 'Ana López',
  email: 'ana@example.com',
  phone: '+525512345678',
  channel: 'SMS',
};

describe('buildNotification', () => {
  it('usa una llave por pedido y evento para que reintentar no duplique el aviso', () => {
    const a = buildNotification('order.confirmed', order, customer, 'Tienda Demo');
    const b = buildNotification('order.confirmed', order, customer, 'Tienda Demo');
    const c = buildNotification('order.shipped', order, customer, 'Tienda Demo');
    expect(a.idempotencyKey).toBe('PED-ABC123:order.confirmed');
    expect(b.idempotencyKey).toBe(a.idempotencyKey);
    expect(c.idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it('manda todos los contactos para permitir el fallback y respeta el canal preferido', () => {
    const { input } = buildNotification('order.confirmed', order, customer, 'Tienda Demo');
    expect(input.preferredChannel).toBe('SMS');
    expect(input.recipient).toMatchObject({ email: 'ana@example.com', phone: '+525512345678' });
    expect(input.recipient.deviceToken?.length).toBeGreaterThanOrEqual(10);
    expect(input.sender.name).toBe('Tienda Demo');
    expect(input.message.body).toContain('Ana');
    expect(input.message.body).toContain('PED-ABC123');
    expect(input.message.data).toEqual({ orderId: 'PED-ABC123', event: 'order.confirmed' });
  });

  it('da prioridad alta al pago rechazado', () => {
    expect(buildNotification('payment.rejected', order, customer, 'T').input.priority).toBe('HIGH');
    expect(buildNotification('order.delivered', order, customer, 'T').input.priority).toBe('LOW');
  });

  it('calcula el total del pedido', () => {
    expect(orderTotal(order)).toBe(627);
  });
});

describe('parseEventRequest', () => {
  const valid = { event: 'order.confirmed', order, customer };

  it('acepta una solicitud válida', () => {
    expect(parseEventRequest(valid)).toMatchObject({ ok: true, event: 'order.confirmed' });
  });

  it.each([
    [{ ...valid, event: 'order.cancelled' }, 'evento desconocido'],
    [{ ...valid, order: { ...order, id: 'x' } }, 'pedido inválido'],
    [{ ...valid, order: { ...order, items: [] } }, 'el pedido no tiene productos'],
    [{ ...valid, order: { ...order, items: [{ name: 'A', quantity: 0, price: 1 }] } }, 'producto inválido'],
    [{ ...valid, customer: { ...customer, email: 'no-es-correo' } }, 'correo inválido'],
    [{ ...valid, customer: { ...customer, phone: '5512345678' } }, 'el teléfono debe ir en formato +52…'],
    [{ ...valid, customer: { ...customer, channel: 'WEBHOOK' } }, 'canal inválido'],
  ])('rechaza datos inválidos (%#)', (body, error) => {
    expect(parseEventRequest(body)).toEqual({ ok: false, error });
  });
});
