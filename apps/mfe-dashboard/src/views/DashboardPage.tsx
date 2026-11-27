import { shellLink } from '@notifyhub/mfe-runtime';
import {
  ActivityChart,
  RouteMap,
  StatusBadge,
  computeFlows,
  summarize,
  useNotifications,
  useProviders,
  NotificationItem,
} from '@notifyhub/ui';
import type { NotificationListItem, Priority } from '@notifyhub/client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@notifyhub/mfe-runtime/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@notifyhub/mfe-runtime/ui/card';
import { cn } from '@notifyhub/mfe-runtime';
import { NotificationSheet } from '@notifyhub/mfe-runtime';
import { Page } from '@notifyhub/mfe-runtime';
import { LoadError, PageHeader } from '@notifyhub/mfe-runtime';

function Kpi({
  label,
  value,
  unit,
  hint,
  tone,
  fill,
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone?: string;
  /** 0–100: dibuja una barra de avance bajo el valor. */
  fill?: number | null;
}) {
  return (
    <Card className="gap-0 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p
        className={cn(
          'mt-2 font-heading text-[32px] font-extrabold leading-none tracking-tight tabular-nums',
          tone,
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-base font-bold">{unit}</span>}
      </p>
      {fill !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div
            className={cn('h-full rounded-full', tone === 'text-transfer-ink' ? 'bg-transfer' : 'bg-success')}
            style={{ width: `${Math.max(0, Math.min(100, fill ?? 0))}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

const num = (n: number | null, digits = 1) =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits });
const IN_FLIGHT = ['RECEIVED', 'QUEUED', 'SENDING', 'RETRYING', 'FALLBACK'];
const PRIORITIES: { key: Priority; label: string; tone: string }[] = [
  { key: 'HIGH', label: 'alta', tone: 'bg-destructive' },
  { key: 'MEDIUM', label: 'media', tone: 'bg-line-push' },
  { key: 'LOW', label: 'baja', tone: 'bg-ink-3' },
];

export function Dashboard() {
  return (
    <Page>
      <DashboardView />
    </Page>
  );
}

function DashboardView() {
  const list = useNotifications({ limit: 100 }, { intervalMs: 3000 });
  const providers = useProviders({ intervalMs: 5000 });
  const [sel, setSel] = useState<NotificationListItem | null>(null);
  const items = list.data?.items ?? [];
  const { flows, transfers } = computeFlows(items);
  const s = summarize(items);
  const inFlight = (p: Priority) =>
    items.filter((i) => i.priority === p && IN_FLIGHT.includes(i.status)).length;
  const maxLatency = Math.max(0, ...items.map((i) => i.totalLatencyMs));

  return (
    <>
      <PageHeader
        title="Resumen"
        description={`Últimas ${items.length} notificaciones · todos los canales · se actualiza cada 3 s`}
      >
        <span className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          En vivo
        </span>
        <Button render={<a {...shellLink('/nueva')} />}>
          <Plus /> Nueva solicitud
        </Button>
      </PageHeader>

      {list.error && !list.data ? (
        <LoadError error={list.error} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Notificaciones" value={num(s.total, 0)} hint="en la ventana consultada" />
            <Kpi
              label="Entrega"
              value={num(s.deliveryRate)}
              unit={s.deliveryRate === null ? '' : '%'}
              hint="llegan a su destinatario"
              fill={s.deliveryRate}
            />
            <Kpi
              label="Por respaldo"
              value={num(s.fallbackRate)}
              unit={s.fallbackRate === null ? '' : '%'}
              hint="cambiaron de canal"
              tone="text-transfer-ink"
              fill={s.fallbackRate}
            />
            <Kpi
              label="p95 de entrega"
              value={num(s.p95LatencyMs, 0)}
              unit={s.p95LatencyMs === null ? '' : 'ms'}
              hint="el 95 % llega en menos de esto"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Actividad</CardTitle>
              <CardDescription>Notificaciones recibidas a lo largo del tiempo, por resultado</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityChart items={items} height={104} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Mapa de rutas</CardTitle>
                <CardDescription>
                  Del pedido recibido a la entrega. Los transbordos naranjas son envíos que cambiaron de canal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RouteMap flows={flows} providers={providers.data ?? []} transfers={transfers} />
              </CardContent>
            </Card>

            <div className="space-y-4 self-start">
              <Card>
                <CardHeader>
                  <CardTitle>Salud de proveedores</CardTitle>
                  <CardDescription>Estado actual de cada canal de salida</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {(providers.data ?? []).map((p) => (
                    <div key={p.code} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{p.code}</span>
                      <StatusBadge status={p.health} label={p.enabled ? undefined : 'Deshabilitado'} />
                    </div>
                  ))}
                  {(providers.data ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin datos de proveedores.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>En curso</CardTitle>
                  <CardDescription>Aún no terminan, por prioridad</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {PRIORITIES.map((p) => (
                    <div key={p.key} className="flex items-center gap-3 text-sm">
                      <span className={cn('size-2.5 rounded-full', p.tone)} />
                      <span className="flex-1 font-medium">Prioridad {p.label}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {inFlight(p.key)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="gap-0 py-0">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <div className="flex-1">
                <CardTitle>Actividad reciente</CardTitle>
                <CardDescription>Haz clic en una fila para ver su ruta</CardDescription>
              </div>
              <Button variant="ghost" size="sm" render={<a {...shellLink('/notificaciones')} />}>
                Ver todas →
              </Button>
            </div>
            <CardContent className="p-0">
              {items.slice(0, 6).map((n) => (
                <NotificationItem key={n.id} item={n} compact onSelect={setSel} maxLatencyMs={maxLatency} />
              ))}
              {items.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {list.loading ? 'Cargando…' : 'Aún no hay notificaciones.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <NotificationSheet item={sel} onClose={() => setSel(null)} />
    </>
  );
}
