import { describe, expect, it } from 'vitest';
import { parseNotification, type AppNotification } from './notification-contract';
import { createNotificationStore } from './notification-store';

let clock = 1_000;
const make = (id: string, ttl = 3600): AppNotification =>
  parseNotification({ id, title: `n-${id}`, ttl }, { sourceMfe: 'mfe-a', now: clock })!;

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

/** Canal falso: entrega lo que una pestaña publica a las demás. */
const bus = () => {
  const peers: { onmessage: ((e: MessageEvent) => void) | null }[] = [];
  return () => {
    const self = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      postMessage: (data: unknown) =>
        peers.filter((p) => p !== self).forEach((p) => p.onmessage?.({ data } as MessageEvent)),
      close: () => {},
    };
    peers.push(self);
    return self;
  };
};

describe('bandeja de notificaciones', () => {
  it('agrega, deduplica por id y cuenta no leídas', () => {
    const s = createNotificationStore({ now: () => clock });
    s.add(make('a'));
    s.add(make('a'));
    s.add(make('b'));
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(s.unreadCount()).toBe(2);
    s.markRead('a');
    expect(s.unreadCount()).toBe(1);
    s.markAllRead();
    expect(s.unreadCount()).toBe(0);
  });

  it('descarta y vacía', () => {
    const s = createNotificationStore({ now: () => clock });
    s.add(make('a'));
    s.add(make('b'));
    s.dismiss('a');
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual(['b']);
    s.clear();
    expect(s.getSnapshot().items).toEqual([]);
  });

  it('respeta el máximo de elementos y expulsa los más viejos', () => {
    const s = createNotificationStore({ now: () => clock, max: 3 });
    for (const id of ['1', '2', '3', '4']) s.add(make(id));
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual(['4', '3', '2']);
  });

  it('expira por ttl al podar', () => {
    clock = 1_000;
    const s = createNotificationStore({ now: () => clock });
    s.add(make('corta', 5));
    s.add(make('fija', 0));
    clock = 1_000 + 6_000;
    expect(s.prune()).toBe(1);
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual(['fija']);
  });

  it('persiste y no recupera lo ya expirado', () => {
    clock = 1_000;
    const storage = memory();
    const first = createNotificationStore({ storage, now: () => clock });
    first.add(make('corta', 5));
    first.add(make('larga', 3600));
    clock = 1_000 + 10_000;
    const second = createNotificationStore({ storage, now: () => clock });
    expect(second.getSnapshot().items.map((i) => i.id)).toEqual(['larga']);
  });

  it('sobrevive a un almacenamiento corrupto', () => {
    const storage = { getItem: () => '{no es json', setItem: () => {} };
    expect(createNotificationStore({ storage }).getSnapshot().items).toEqual([]);
  });

  it('sincroniza entre pestañas sin rebotar el mensaje', () => {
    const open = bus();
    const a = createNotificationStore({ channel: open(), now: () => clock });
    const b = createNotificationStore({ channel: open(), now: () => clock });
    a.add(make('x'));
    expect(b.getSnapshot().items.map((i) => i.id)).toEqual(['x']);
    b.markRead('x');
    expect(a.unreadCount()).toBe(0);
    a.dismiss('x');
    expect(b.getSnapshot().items).toEqual([]);
  });

  it('avisa a los suscriptores en cada cambio', () => {
    const s = createNotificationStore({ now: () => clock });
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.add(make('a'));
    s.markRead('a');
    off();
    s.clear();
    expect(calls).toBe(2);
  });
});
