import { ApiError, NOTIFYHUB_URL, createApi, type ArchitectureHealth, API_URL } from '@taskflow/kit';
import { Database, Network, Radio, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

const api = createApi(API_URL, () => null);

type Node = { id: string; label: string; detail: string; ok?: boolean; ms?: number };

function Dot({ ok }: { ok?: boolean }) {
  const color = ok === undefined ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-red-500';
  return <span className={`inline-block size-2.5 rounded-full ${color}`} aria-hidden />;
}

function Card({ node }: { node: Node }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{node.label}</p>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Dot ok={node.ok} />
          {node.ok === undefined ? 'sin datos' : node.ok ? `${node.ms ?? 0} ms` : 'caído'}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{node.detail}</p>
    </div>
  );
}

const ROWS: [string, string, string][] = [
  ['Estilo', 'Modular serverless: un API, un despachador, un relay', 'Microservicios con API Gateway'],
  ['Entrada', 'API key por cliente', 'JWT con roles (admin, líder, miembro)'],
  ['Estado', 'Cloudflare Queues + Postgres (Neon)', 'Redis (caché, sesiones, lista negra, pub/sub) + Postgres'],
  ['Despliegue', 'Workers en Cloudflare', 'Contenedores Docker en Render'],
  ['Frontend', 'Shell + 4 microfrontends', 'Shell + 2 microfrontends'],
  ['Notificaciones', 'Es el producto: entrega por correo, SMS, push y webhook', 'Evento Redis → servicio → SSE → campana del shell'],
];

export function ArchitecturePage() {
  const [health, setHealth] = useState<ArchitectureHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.architecture();
        if (!alive) return;
        setHealth(data);
        setError(null);
        setUpdated(new Date());
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : 'No se pudo consultar el gateway.');
      }
    };
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const svc = health?.services;
  const nodes: Node[] = [
    { id: 'auth', label: 'auth-service', detail: 'Registro, login, roles y JWT. Guarda la sesión en Redis.', ...svc?.auth },
    { id: 'tasks', label: 'task-service', detail: 'Proyectos y tareas. Caché-aside en Redis y publica eventos.', ...svc?.tasks },
    { id: 'notifications', label: 'notification-service', detail: 'Se suscribe a Redis, guarda en Postgres y emite por SSE.', ...svc?.notifications },
    { id: 'presence', label: 'presence-service', detail: 'Usuario en línea y sesiones activas con expiración.', ...svc?.presence },
  ];

  return (
    <div className="space-y-7">
      <section>
        <p className="max-w-3xl text-sm text-muted-foreground">
          TaskFlow es la segunda versión del proyecto y adopta otra arquitectura a propósito: en lugar de un
          sistema modular serverless, separa responsabilidades en microservicios detrás de un API Gateway que
          valida el JWT. Este panel consulta la salud real de cada pieza cada 10 segundos.
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <section aria-label="Diagrama en vivo" className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-accent/40 p-3.5 text-sm">
            <p className="flex items-center gap-2 font-semibold"><Network className="size-4" /> Navegador</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Shell + 2 microfrontends (Cloudflare). Un solo origen de API: el gateway.
            </p>
          </div>
          <span className="hidden text-muted-foreground md:block">→ HTTPS + JWT →</span>
          <div className="rounded-xl border-2 border-primary bg-card p-3.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" /> api-gateway</p>
              <Dot ok={health?.gateway.ok} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Valida el JWT, consulta la lista negra en Redis, aplica CORS y firma cada llamada interna con un token
              compartido.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{nodes.map((n) => <Card key={n.id} node={n} />)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card node={{ id: 'redis', label: 'Redis (Key Value)', detail: 'Sesiones, lista negra de tokens, caché de tareas y canal pub/sub task-events.', ...health?.redis }} />
          <div className="rounded-xl border bg-card p-3.5">
            <p className="flex items-center gap-2 font-semibold"><Database className="size-4" /> PostgreSQL</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Un esquema por servicio: auth, tasks y notifications. Sin acceso desde internet.
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="size-3.5" />
          {updated ? `Actualizado ${updated.toLocaleTimeString('es-MX')}` : 'Consultando…'} · Los servicios gratuitos de
          Render tardan hasta un minuto en despertar.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold">Versión 1 frente a versión 2</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5"> </th>
                <th className="px-4 py-2.5">NotifyHub (v1)</th>
                <th className="px-4 py-2.5">TaskFlow (v2)</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([name, a, b]) => (
                <tr key={name} className="border-t align-top">
                  <th className="px-4 py-2.5 text-left font-semibold">{name}</th>
                  <td className="px-4 py-2.5 text-muted-foreground">{a}</td>
                  <td className="px-4 py-2.5">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a className="mt-3 inline-block text-sm font-medium text-primary underline" href={NOTIFYHUB_URL}>
          Abrir NotifyHub (versión 1)
        </a>
      </section>
    </div>
  );
}
