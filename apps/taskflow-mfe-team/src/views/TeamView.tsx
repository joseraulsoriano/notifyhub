import { notify } from '@notifyhub/mfe-runtime';
import { Badge } from '@notifyhub/mfe-runtime/ui/badge';
import { Button } from '@notifyhub/mfe-runtime/ui/button';
import {
  API_URL,
  ApiError,
  ROLE_LABEL,
  STATUS_LABEL,
  createApi,
  getToken,
  type DirectoryUser,
  type Role,
  type ServerNotification,
  type Session,
} from '@taskflow/kit';
import { Check, Clock, Radio, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const api = createApi(API_URL, getToken);
const ROLES: Role[] = ['member', 'leader', 'admin'];
const fail = (e: unknown, fallback: string) => notify.error(e instanceof ApiError ? e.message : fallback);

const describe = (n: ServerNotification): string => {
  const title = n.payload.task?.title ?? 'una tarea';
  if (n.event_type === 'task_assigned') return `Te asignaron «${title}»`;
  const status = n.payload.task?.status ? STATUS_LABEL[n.payload.task.status] : 'otro estado';
  return `«${title}» cambió a ${status}`;
};

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.round((until - now) / 1000));
  return <span className="font-mono">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span>;
}

export function TeamView({ session }: { session: Session }) {
  const me = session.user;
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<ServerNotification[] | null>(null);

  const loadPresence = useCallback(async (list: DirectoryUser[]) => {
    const entries = await Promise.all(
      list.slice(0, 40).map(async (u) => [u.id, await api.presence.online(u.id).then((r) => r.online, () => false)] as const),
    );
    setOnline(Object.fromEntries(entries));
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [{ users }, { notifications }] = await Promise.all([api.users(), api.notifications.list(30)]);
      setUsers(users);
      setItems(notifications);
      await loadPresence(users);
    } catch (e) {
      setUsers([]);
      setItems([]);
      fail(e, 'No se pudo cargar el equipo.');
    }
  }, [loadPresence]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // La presencia vive en Redis con TTL: se refresca cada 15 s.
  useEffect(() => {
    if (!users) return;
    const timer = window.setInterval(() => void loadPresence(users), 15_000);
    return () => window.clearInterval(timer);
  }, [users, loadPresence]);

  const changeRole = async (user: DirectoryUser, role: Role) => {
    try {
      await api.setRole(user.id, role);
      setUsers((list) => list?.map((u) => (u.id === user.id ? { ...u, role } : u)) ?? null);
      notify.success(`${user.name} ahora es ${ROLE_LABEL[role].toLowerCase()}`);
    } catch (e) {
      fail(e, 'No se pudo cambiar el rol.');
    }
  };

  const markRead = async (id: string) => {
    try {
      const { notification } = await api.notifications.read(id);
      setItems((list) => list?.map((n) => (n.id === id ? notification : n)) ?? null);
    } catch (e) {
      fail(e, 'No se pudo marcar como leída.');
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Mi sesión">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Sesión</p>
          <p className="mt-1 font-bold">{me.name}</p>
          <p className="text-sm text-muted-foreground">{me.email}</p>
          <Badge className="mt-2" variant="secondary"><ShieldCheck className="size-3" /> {ROLE_LABEL[me.role]}</Badge>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock className="size-3.5" /> El token expira en</p>
          <p className="mt-1 text-2xl font-black"><Countdown until={session.expiresAt} /></p>
          <p className="mt-1 text-xs text-muted-foreground">La sesión vive en Redis con el mismo TTL (15 min).</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Radio className="size-3.5" /> En línea</p>
          <p className="mt-1 flex items-center gap-2 font-bold">
            <span className={`size-2.5 rounded-full ${online[me.id] ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {online[me.id] ? 'Conectado' : 'Verificando…'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Lo registra el presence-service en Redis y se renueva al iniciar sesión.</p>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label="Equipo">
          <h2 className="mb-2 text-sm font-bold">Equipo</h2>
          {users === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={`size-2.5 rounded-full ${online[u.id] ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    title={online[u.id] ? 'En línea' : 'Desconectado'}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{u.name}{u.id === me.id && ' (tú)'}</span>
                  {me.role === 'admin' && u.id !== me.id ? (
                    <select
                      aria-label={`Rol de ${u.name}`}
                      value={u.role}
                      onChange={(e) => void changeRole(u, e.target.value as Role)}
                      className="h-8 rounded-md border bg-background px-1.5 text-xs"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  ) : (
                    <Badge variant="outline">{ROLE_LABEL[u.role]}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {me.role !== 'admin' && <p className="mt-2 text-xs text-muted-foreground">Solo un administrador puede cambiar roles.</p>}
        </section>

        <section aria-label="Actividad">
          <h2 className="mb-2 text-sm font-bold">Actividad</h2>
          {items === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sin actividad todavía. Aquí aparece cuando te asignan una tarea o cambia su estado.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={n.read_at ? 'text-muted-foreground' : 'font-semibold'}>{describe(n)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString('es-MX')}</p>
                  </div>
                  {!n.read_at && (
                    <Button size="sm" variant="ghost" onClick={() => void markRead(n.id)}>
                      <Check className="size-3.5" /> Leída
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
