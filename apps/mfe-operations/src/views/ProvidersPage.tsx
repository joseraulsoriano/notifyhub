import {
  NotifyHubError,
  type Channel,
  type DispatchCapacitySnapshot,
  type Priority,
  type ProviderHealth,
} from '@notifyhub/client';
import {
  CHANNEL_LABEL,
  ChannelTag,
  PRIORITY_LABEL,
  PriorityBadge,
  StatusBadge,
  useProviders,
} from '@notifyhub/ui';
import { Info } from 'lucide-react';
import { notify } from '@notifyhub/mfe-runtime';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@notifyhub/mfe-runtime/ui/card';
import { Switch } from '@notifyhub/mfe-runtime/ui/switch';
import { FALLBACK_CHAINS, STRATEGY_BY_PRIORITY } from '@notifyhub/mfe-runtime';
import { useNotifyHubClient } from '@notifyhub/ui';
import { useConnection } from '@notifyhub/mfe-runtime';
import { FilterSelect } from '@notifyhub/mfe-runtime';
import { Page } from '@notifyhub/mfe-runtime';
import { LoadError, PageHeader } from '@notifyhub/mfe-runtime';

const HEALTHS: { value: ProviderHealth; label: string }[] = [
  { value: 'UP', label: 'Operativo' },
  { value: 'DEGRADED', label: 'Degradado' },
  { value: 'DOWN', label: 'Caído' },
];

export function ProvidersPage() {
  return (
    <Page>
      <ProvidersView />
    </Page>
  );
}

function ProvidersView() {
  const client = useNotifyHubClient();
  const { connection } = useConnection();
  const { data, error, refresh } = useProviders({ intervalMs: 5000 });
  const [capacity, setCapacity] = useState<DispatchCapacitySnapshot | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await client.dispatch.capacity();
        if (active) {
          setCapacity(snapshot);
          setCapacityError(null);
        }
      } catch (e) {
        if (active) setCapacityError(e instanceof Error ? e.message : 'Error desconocido');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 750);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [client]);

  const update = async (code: string, patch: { health?: ProviderHealth; enabled?: boolean }) => {
    try {
      await client.providers.update(code, patch);
      notify.success(
        `${code}: ${patch.health ? HEALTHS.find((h) => h.value === patch.health)!.label.toLowerCase() : patch.enabled ? 'habilitado' : 'deshabilitado'}`,
      );
      await refresh();
    } catch (e) {
      notify.error(
        e instanceof NotifyHubError && e.status === 403
          ? 'Esta API key no puede modificar proveedores (PROVIDER_ADMIN_CLIENTS)'
          : e instanceof Error
            ? e.message
            : 'No se pudo actualizar',
      );
    }
  };

  return (
    <>
      <PageHeader
        title="Proveedores y ruteo"
        description="Salud de cada proveedor y reglas de fallback (SCRUM-34 y SCRUM-35)"
      />
      {error && !data && <LoadError error={error} />}
      <div className="mb-4 flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          En esta simulación, marca <b className="text-foreground">fcm</b> como{' '}
          <b className="text-foreground">Caído</b> y manda una notificación por Push desde «Nueva solicitud».
          Se simularán tres fallos y después pasará a SMS. No es una comprobación real del proveedor. Para
          cambiar salud en modo conectado, la API key necesita permiso en <code>PROVIDER_ADMIN_CLIENTS</code>.
        </p>
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Concurrencia del despacho</CardTitle>
          <CardDescription>
            Límites globales compartidos por las colas de prioridad. Actividad actualizada cada 750 ms.
            {connection.mode === 'demo' && ' En modo demo los contadores no representan un Worker real.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {capacityError ? (
            <p className="text-sm text-destructive">
              No se pudo consultar la capacidad: {capacityError}. Verifica que la API local esté conectada y
              tenga aplicadas sus migraciones.
            </p>
          ) : !capacity ? (
            <p className="text-sm text-muted-foreground">Cargando capacidad…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {capacity.providers.map((provider) => (
                <div key={provider.provider} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{provider.provider}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {provider.activeCount}/{provider.limit}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-label={`Concurrencia de ${provider.provider}`}
                    aria-valuemin={0}
                    aria-valuemax={provider.limit}
                    aria-valuenow={Math.min(provider.activeCount, provider.limit)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{
                        width: `${Math.min(100, (provider.activeCount / provider.limit) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>Envíos activos: {provider.activeCount}</span>
                    <span>En espera: {provider.waitingCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden p-0">
        <div className="hidden grid-cols-[1.3fr_1fr_1.1fr_0.7fr_0.9fr_auto] items-center gap-4 border-b bg-secondary px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <span>Proveedor</span>
          <span>Estado</span>
          <span>Confiabilidad</span>
          <span>Costo / msg</span>
          <span>Salud simulada</span>
          <span className="w-10 text-right">Activo</span>
        </div>
        {(data ?? []).map((p) => (
          <div
            key={p.code}
            className="grid grid-cols-2 items-center gap-x-4 gap-y-3 border-b px-5 py-4 last:border-b-0 md:grid-cols-[1.3fr_1fr_1.1fr_0.7fr_0.9fr_auto]"
          >
            <div>
              <p className="font-mono text-sm font-semibold">{p.code}</p>
              <ChannelTag channel={p.channel} className="mt-1 text-xs" />
            </div>
            <div>
              <StatusBadge status={p.health} label={p.enabled ? undefined : 'Deshabilitado'} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-label={`Confiabilidad de ${p.code}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.reliabilityScore}
                >
                  <div
                    className={`h-full rounded-full ${p.reliabilityScore >= 95 ? 'bg-success' : p.reliabilityScore >= 80 ? 'bg-line-push' : 'bg-destructive'}`}
                    style={{ width: `${p.reliabilityScore}%` }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums">{p.reliabilityScore}%</span>
              </div>
            </div>
            <p className="font-mono text-sm">${p.costPerMessage.toFixed(4)}</p>
            <FilterSelect
              className="h-8 w-full text-xs"
              value={p.health}
              onChange={(v) => void update(p.code, { health: v as ProviderHealth })}
              options={HEALTHS}
            />
            <div className="flex justify-end md:w-10">
              <Switch
                checked={p.enabled}
                onCheckedChange={(v) => void update(p.code, { enabled: v })}
                aria-label={`Habilitar ${p.code}`}
              />
            </div>
          </div>
        ))}
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Reglas de ruteo</CardTitle>
          <CardDescription>
            Valores predeterminados compilados; no se editan desde esta pantalla
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            {(Object.keys(FALLBACK_CHAINS) as Channel[]).map((c) => (
              <div key={c} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-20 font-medium">{CHANNEL_LABEL[c]}</span>
                {FALLBACK_CHAINS[c].map((next, i) => (
                  <span key={next} className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-mono text-transfer">{i === 0 ? '⇄' : '→'}</span>
                    <ChannelTag channel={next} className="text-foreground" />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {(Object.keys(STRATEGY_BY_PRIORITY) as Priority[]).map((p) => (
              <div key={p} className="flex items-center gap-3 text-sm">
                <span className="w-16">
                  <PriorityBadge priority={p} />
                </span>
                <span className="text-muted-foreground">
                  prioridad {PRIORITY_LABEL[p].toLowerCase()} → estrategia de{' '}
                  <b className="text-foreground">{STRATEGY_BY_PRIORITY[p]}</b>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
