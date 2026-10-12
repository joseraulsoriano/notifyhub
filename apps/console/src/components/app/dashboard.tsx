import {
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { NotificationSheet } from './notification-panel';
import { Page } from './page';
import { LoadError, PageHeader } from './page-header';

function Stat({ value, unit, label, tone }: { value: string; unit?: string; label: string; tone?: string }) {
  return (
    <div>
      <div
        className={cn(
          'font-heading text-[28px] font-extrabold leading-none tracking-tight tabular-nums',
          tone,
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-sm font-bold">{unit}</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
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

  return (
    <>
      <PageHeader title="Resumen" description={`Últimas ${items.length} notificaciones · todos los canales`}>
        <div className="mr-2 flex gap-8">
          <Stat value={num(s.total, 0)} label="notificaciones" />
          <Stat value={num(s.deliveryRate)} unit={s.deliveryRate === null ? '' : '%'} label="llegan" />
          <Stat
            value={num(s.fallbackRate)}
            unit={s.fallbackRate === null ? '' : '%'}
            label="por respaldo"
            tone="text-transfer-ink"
          />
          <Stat
            value={num(s.p95LatencyMs, 0)}
            unit={s.p95LatencyMs === null ? '' : 'ms'}
            label="p95 de entrega"
          />
        </div>
        <Button render={<a href="/nueva" />}>
          <Plus /> Nueva solicitud
        </Button>
      </PageHeader>

      {list.error && !list.data ? (
        <LoadError error={list.error} />
      ) : (
        <>
          <Card>
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

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="gap-0 py-0 lg:col-span-2">
              <div className="flex items-center gap-3 border-b px-5 py-4">
                <div className="flex-1">
                  <CardTitle>Actividad reciente</CardTitle>
                  <CardDescription>Haz clic en una fila para ver su ruta</CardDescription>
                </div>
                <Button variant="ghost" size="sm" render={<a href="/notificaciones" />}>
                  Ver todas →
                </Button>
              </div>
              <CardContent className="p-0">
                {items.slice(0, 6).map((n) => (
                  <NotificationItem key={n.id} item={n} compact onSelect={setSel} />
                ))}
                {items.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {list.loading ? 'Cargando…' : 'Aún no hay notificaciones.'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="self-start">
              <CardHeader>
                <CardTitle>En curso</CardTitle>
                <CardDescription>Notificaciones que aún no terminan, por prioridad</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {PRIORITIES.map((p) => (
                  <div key={p.key} className="flex items-center gap-3 text-sm">
                    <span className={cn('size-2.5 rounded-full', p.tone)} />
                    <span className="flex-1 font-medium">Prioridad {p.label}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {inFlight(p.key)}
                    </span>
                  </div>
                ))}
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Proveedores</p>
                  {(providers.data ?? []).map((p) => (
                    <div key={p.code} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{p.code}</span>
                      <StatusBadge status={p.health} label={p.enabled ? undefined : 'Deshabilitado'} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <NotificationSheet item={sel} onClose={() => setSel(null)} />
    </>
  );
}
