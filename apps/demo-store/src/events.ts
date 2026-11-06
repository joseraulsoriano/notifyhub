import type { Channel, CreateNotificationInput, Priority } from '@notifyhub/client';

/** Eventos de negocio de la tienda que generan un aviso al comprador. */
export const ORDER_EVENTS = [
  'order.confirmed',
  'payment.rejected',
  'order.shipped',
  'order.delivered',
] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

export const CUSTOMER_CHANNELS = ['EMAIL', 'SMS', 'PUSH'] as const satisfies readonly Channel[];
export type CustomerChannel = (typeof CUSTOMER_CHANNELS)[number];

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
  channel: CustomerChannel;
}

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export const orderTotal = (order: Order) =>
  order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

interface Template {
  label: string;
  priority: Priority;
  subject: (order: Order) => string;
  body: (order: Order, customer: Customer, store: string) => string;
}

const firstName = (customer: Customer) => customer.name.trim().split(/\s+/)[0] ?? customer.name;

export const TEMPLATES: Record<OrderEvent, Template> = {
  'order.confirmed': {
    label: 'Pedido confirmado',
    priority: 'MEDIUM',
    subject: (o) => `Confirmamos tu pedido ${o.id}`,
    body: (o, c, store) =>
      `Hola ${firstName(c)}, ${store} recibió tu pedido ${o.id} por ${money.format(orderTotal(o))}. ` +
      `Te avisaremos cuando salga a entrega.`,
  },
  'payment.rejected': {
    label: 'Pago rechazado',
    priority: 'HIGH',
    subject: (o) => `No pudimos cobrar tu pedido ${o.id}`,
    body: (o, c, store) =>
      `Hola ${firstName(c)}, tu banco rechazó el pago del pedido ${o.id} en ${store}. ` +
      `Actualiza tu método de pago en las próximas 24 h para no perderlo.`,
  },
  'order.shipped': {
    label: 'Envío en camino',
    priority: 'MEDIUM',
    subject: (o) => `Tu pedido ${o.id} va en camino`,
    body: (o, c) =>
      `Hola ${firstName(c)}, tu pedido ${o.id} ya salió del almacén y llega en 2 a 3 días hábiles.`,
  },
  'order.delivered': {
    label: 'Pedido entregado',
    priority: 'LOW',
    subject: (o) => `Entregamos tu pedido ${o.id}`,
    body: (o, c, store) =>
      `Hola ${firstName(c)}, tu pedido ${o.id} fue entregado. Gracias por comprar en ${store}.`,
  },
};

/**
 * Traduce un evento del pedido a una solicitud de NotifyHub.
 * Se mandan todos los datos de contacto para que NotifyHub pueda conmutar de canal si el preferido falla.
 */
export function buildNotification(
  event: OrderEvent,
  order: Order,
  customer: Customer,
  store: string,
): { input: CreateNotificationInput; idempotencyKey: string } {
  const template = TEMPLATES[event];
  return {
    // Mismo pedido + mismo evento = misma llave: reintentar desde la tienda no le duplica el aviso al cliente.
    idempotencyKey: `${order.id}:${event}`,
    input: {
      sender: { name: store },
      recipient: {
        email: customer.email,
        phone: customer.phone,
        deviceToken: `demo-device-${order.id}`,
      },
      message: {
        subject: template.subject(order),
        body: template.body(order, customer, store),
        data: { orderId: order.id, event },
      },
      priority: template.priority,
      preferredChannel: customer.channel,
    },
  };
}

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_ID = /^[A-Z0-9-]{4,40}$/;

/** Valida lo que manda el navegador; devuelve el primer error en español o los datos tipados. */
export function parseEventRequest(
  raw: unknown,
): { ok: true; event: OrderEvent; order: Order; customer: Customer } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'cuerpo inválido' };
  const { event, order, customer } = raw as Record<string, unknown>;
  if (!ORDER_EVENTS.includes(event as OrderEvent)) return { ok: false, error: 'evento desconocido' };

  const o = order as Partial<Order> | undefined;
  if (!o || typeof o.id !== 'string' || !ORDER_ID.test(o.id)) return { ok: false, error: 'pedido inválido' };
  if (!Array.isArray(o.items) || o.items.length === 0 || o.items.length > 50) {
    return { ok: false, error: 'el pedido no tiene productos' };
  }
  const items: OrderItem[] = [];
  for (const item of o.items as unknown[]) {
    const i = item as Partial<OrderItem>;
    if (
      typeof i.name !== 'string' ||
      !i.name.trim() ||
      !Number.isInteger(i.quantity) ||
      (i.quantity as number) < 1 ||
      typeof i.price !== 'number' ||
      !(i.price >= 0)
    ) {
      return { ok: false, error: 'producto inválido' };
    }
    items.push({ name: i.name.slice(0, 120), quantity: i.quantity as number, price: i.price });
  }

  const c = customer as Partial<Customer> | undefined;
  if (!c || typeof c.name !== 'string' || !c.name.trim()) return { ok: false, error: 'falta el nombre' };
  if (typeof c.email !== 'string' || !EMAIL.test(c.email)) return { ok: false, error: 'correo inválido' };
  if (typeof c.phone !== 'string' || !E164.test(c.phone)) {
    return { ok: false, error: 'el teléfono debe ir en formato +52…' };
  }
  if (!CUSTOMER_CHANNELS.includes(c.channel as CustomerChannel))
    return { ok: false, error: 'canal inválido' };

  return {
    ok: true,
    event: event as OrderEvent,
    order: { id: o.id, items },
    customer: {
      name: c.name.trim().slice(0, 120),
      email: c.email,
      phone: c.phone,
      channel: c.channel as CustomerChannel,
    },
  };
}
