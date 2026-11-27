import { NOTIFY_CHANNEL, isExpired, type AppNotification } from './notification-contract';

/** Bandeja de notificaciones del shell: historial, estado de lectura, expiración y sincronía entre pestañas. */
export type NotificationState = {
  items: readonly AppNotification[];
  readIds: readonly string[];
};

type Message =
  | { op: 'add'; item: AppNotification }
  | { op: 'read'; ids: string[] }
  | { op: 'dismiss'; id: string }
  | { op: 'clear' };

export type StoreOptions = {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Abre el canal entre pestañas. En pruebas se inyecta uno falso; `null` lo desactiva. */
  channel?: Pick<BroadcastChannel, 'postMessage' | 'close'> & {
    onmessage: ((e: MessageEvent) => void) | null;
  };
  now?: () => number;
  max?: number;
  storageKey?: string;
};

const MAX_ITEMS = 50;
const EMPTY: NotificationState = { items: [], readIds: [] };

export function createNotificationStore(options: StoreOptions = {}) {
  const now = options.now ?? Date.now;
  const max = options.max ?? MAX_ITEMS;
  const key = options.storageKey ?? 'notifyhub:notifications:v1';
  const listeners = new Set<() => void>();

  const load = (): NotificationState => {
    try {
      const parsed = JSON.parse(options.storage?.getItem(key) ?? 'null') as NotificationState | null;
      if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.readIds)) return EMPTY;
      const t = now();
      const items = parsed.items.filter((item) => !isExpired(item, t));
      return { items, readIds: parsed.readIds.filter((id) => items.some((item) => item.id === id)) };
    } catch {
      return EMPTY;
    }
  };

  let state: NotificationState = load();
  const channel = options.channel;

  const commit = (next: NotificationState, message?: Message) => {
    state = next;
    try {
      options.storage?.setItem(key, JSON.stringify(state));
    } catch {
      /* almacenamiento lleno o bloqueado: la bandeja sigue en memoria */
    }
    if (message) channel?.postMessage(message);
    listeners.forEach((listener) => listener());
  };

  const apply = (message: Message, broadcast: boolean): void => {
    const out = broadcast ? message : undefined;
    switch (message.op) {
      case 'add': {
        if (state.items.some((item) => item.id === message.item.id)) return;
        commit({ ...state, items: [message.item, ...state.items].slice(0, max) }, out);
        return;
      }
      case 'read':
        commit({ ...state, readIds: [...new Set([...state.readIds, ...message.ids])] }, out);
        return;
      case 'dismiss':
        commit(
          {
            items: state.items.filter((item) => item.id !== message.id),
            readIds: state.readIds.filter((id) => id !== message.id),
          },
          out,
        );
        return;
      case 'clear':
        commit(EMPTY, out);
    }
  };

  if (channel) {
    channel.onmessage = (event) => {
      const data = event.data as Message | undefined;
      if (data && typeof data === 'object' && 'op' in data) apply(data, false);
    };
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    getServerSnapshot: () => EMPTY,
    add: (item: AppNotification) => apply({ op: 'add', item }, true),
    markRead: (id: string) => apply({ op: 'read', ids: [id] }, true),
    markAllRead: () => apply({ op: 'read', ids: state.items.map((item) => item.id) }, true),
    dismiss: (id: string) => apply({ op: 'dismiss', id }, true),
    clear: () => apply({ op: 'clear' }, true),
    /** Quita lo que ya expiró según su `ttl`. Devuelve cuántas quitó. */
    prune(): number {
      const t = now();
      const items = state.items.filter((item) => !isExpired(item, t));
      const removed = state.items.length - items.length;
      if (removed > 0)
        commit({ items, readIds: state.readIds.filter((id) => items.some((item) => item.id === id)) });
      return removed;
    },
    unreadCount: () => state.items.filter((item) => !state.readIds.includes(item.id)).length,
    close: () => channel?.close(),
  };
}

export type NotificationStore = ReturnType<typeof createNotificationStore>;

/** Abre el canal real entre pestañas si el navegador lo trae. */
export function openBrowserChannel(): StoreOptions['channel'] {
  return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(NOTIFY_CHANNEL);
}
