import { NotifyHubError, type Channel, type Priority, type ProviderHealth } from '@notifyhub/client';
import {
  CHANNEL_LABEL,
  ChannelTag,
  PRIORITY_LABEL,
  PriorityBadge,
  StatusBadge,
  useProviders,
} from '@notifyhub/ui';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { FALLBACK_CHAINS, STRATEGY_BY_PRIORITY } from '@/lib/routing';
import { useNotifyHubClient } from '@notifyhub/ui';
import { FilterSelect } from './filter-select';
import { Page } from './page';
import { LoadError, PageHeader } from './page-header';

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
  const { data, error, refresh } = useProviders({ intervalMs: 5000 });

  const update = async (code: string, patch: { health?: ProviderHealth; enabled?: boolean }) => {
    try {
      await client.providers.update(code, patch);
      toast.success(
        `${code}: ${patch.health ? HEALTHS.find((h) => h.value === patch.health)!.label.toLowerCase() : patch.enabled ? 'habilitado' : 'deshabilitado'}`,
      );
      await refresh();
    } catch (e) {
      toast.error(
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
          Para ver el fallback en vivo: marca <b className="text-foreground">fcm</b> como{' '}
          <b className="text-foreground">Caído</b> y manda una notificación por Push desde «Nueva solicitud».
          Tras tres intentos fallidos pasará a SMS.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((p) => (
          <Card key={p.code}>
            <CardHeader>
              <CardTitle className="font-mono">{p.code}</CardTitle>
              <CardDescription>
                <ChannelTag channel={p.channel} className="text-xs" />
              </CardDescription>
              <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-3 self-start justify-self-end">
                <StatusBadge status={p.health} />
                <Switch
                  checked={p.enabled}
                  onCheckedChange={(v) => void update(p.code, { enabled: v })}
                  aria-label={`Habilitar ${p.code}`}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Costo / msg</p>
                  <b className="font-mono">${p.costPerMessage.toFixed(4)}</b>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Confiabilidad</p>
                  <b>{p.reliabilityScore}%</b>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Salud</p>
                  <FilterSelect
                    className="h-7 w-full text-xs"
                    value={p.health}
                    onChange={(v) => void update(p.code, { health: v as ProviderHealth })}
                    options={HEALTHS}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Reglas de ruteo</CardTitle>
          <CardDescription>
            Cadena de fallback por canal y estrategia de selección por prioridad (config/routing.yaml)
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
