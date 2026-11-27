import { NOTIFY_EVENT, parseNotification, type AppNotification, type Severity } from '../lib/notification-contract';
import { createNotificationStore, openBrowserChannel, type NotificationStore } from '../lib/notification-store';
import { showToast } from '../lib/notify';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Info, Trash2, X, XCircle } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

/** Una sola bandeja por pestaña; las demás pestañas se sincronizan por `BroadcastChannel`. */
let store: NotificationStore | null = null;
const getStore = (): NotificationStore =>
  (store ??= createNotificationStore({
    storage: typeof localStorage === 'undefined' ? undefined : localStorage,
    channel: openBrowserChannel(),
  }));

const ICON: Record<Severity, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};
const TONE: Record<Severity, string> = {
  info: 'text-muted-foreground',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  error: 'text-destructive',
};

const ago = (from: number, now: number): string => {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
};

/**
 * Módulo centralizado de notificaciones del shell: escucha `app:notify` (que el shell emite al recibir el
 * `postMessage` de un microfrontend), muestra el aviso, lo guarda en la bandeja y lleva el contador de no
 * leídas. Los MFE solo deciden *cuándo* avisar; aquí se decide *cómo* se muestra y se descarta.
 */
export function NotificationCenter() {
  const s = getStore();
  const state = useSyncExternalStore(s.subscribe, s.getSnapshot, s.getServerSnapshot);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent<AppNotification>).detail;
      // El shell ya validó y fijó `sourceMfe`; se revalida por si otro script emite el evento.
      const item = parseNotification(detail, { sourceMfe: detail?.sourceMfe ?? 'desconocido' });
      if (!item) return;
      s.add(item);
      showToast(item.severity, item.title, item.message);
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    const tick = window.setInterval(() => {
      s.prune();
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.removeEventListener(NOTIFY_EVENT, onNotify);
      window.clearInterval(tick);
    };
  }, [s]);

  const unread = state.items.filter((item) => !state.readIds.includes(item.id)).length;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        onClick={() => {
          setNow(Date.now());
          setOpen(true);
        }}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            data-testid="unread-count"
            className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="z-[60] w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Notificaciones</SheetTitle>
            <SheetDescription>
              Avisos de todos los módulos. {unread > 0 ? `${unread} sin leer.` : 'Todo al día.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex gap-2 px-4">
            <Button variant="outline" size="sm" onClick={s.markAllRead} disabled={unread === 0}>
              <CheckCheck className="size-3.5" /> Marcar todo leído
            </Button>
            <Button variant="outline" size="sm" onClick={s.clear} disabled={state.items.length === 0}>
              <Trash2 className="size-3.5" /> Vaciar
            </Button>
          </div>
          <ul className="flex flex-col gap-2 overflow-y-auto px-4 pb-4" aria-live="polite">
            {state.items.length === 0 && (
              <li className="py-10 text-center text-sm text-muted-foreground">Sin notificaciones.</li>
            )}
            {state.items.map((item) => {
              const Icon = ICON[item.severity];
              const isRead = state.readIds.includes(item.id);
              return (
                <li
                  key={item.id}
                  className={`rounded-lg border p-3 text-sm ${isRead ? 'bg-card' : 'bg-accent/40'}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[item.severity]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.title}</p>
                      {item.message && <p className="mt-0.5 text-muted-foreground">{item.message}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{item.sourceMfe}</Badge>
                        <span>{ago(item.createdAt, now)}</span>
                        {item.actionUrl && (
                          <a
                            className="underline"
                            href={item.actionUrl}
                            onClick={() => s.markRead(item.id)}
                          >
                            Ver
                          </a>
                        )}
                        {!isRead && (
                          <button className="underline" onClick={() => s.markRead(item.id)}>
                            Marcar leída
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      aria-label="Descartar"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => s.dismiss(item.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
