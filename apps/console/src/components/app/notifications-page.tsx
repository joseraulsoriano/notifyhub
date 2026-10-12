import type { NotificationListItem, NotificationStatus } from '@notifyhub/client';
import {
  CHANNEL_LABEL,
  NEEDS_ATTENTION,
  NotificationItem,
  PRIORITY_LABEL,
  dayLabel,
  useNotifications,
} from '@notifyhub/ui';
import { BellOff, MousePointerClick, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilterSelect } from './filter-select';
import { NotificationPanel, NotificationSheet } from './notification-panel';
import { Page } from './page';
import { LoadError, PageHeader } from './page-header';

const ALL = 'all';
const withAll = (label: string, o: Record<string, string>) => [
  { value: ALL, label },
  ...Object.entries(o).map(([value, l]) => ({ value, label: l })),
];
const ACTIVE: NotificationStatus[] = ['RECEIVED', 'QUEUED', 'SENDING', 'RETRYING', 'FALLBACK'];

const TABS = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'active', label: 'En curso', match: (n: NotificationListItem) => ACTIVE.includes(n.status) },
  {
    id: 'delivered',
    label: 'Entregadas',
    match: (n: NotificationListItem) => n.status === 'DELIVERED' || n.status === 'SENT',
  },
  { id: 'fallback', label: 'Con fallback', match: (n: NotificationListItem) => n.usedFallback },
  { id: 'failed', label: 'Fallidas', match: (n: NotificationListItem) => n.status === 'FAILED' },
];

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const f = () => setDesktop(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return desktop;
}

export function NotificationsPage() {
  return (
    <Page>
      <NotificationsView />
    </Page>
  );
}

function NotificationsView() {
  const { data, error, loading } = useNotifications({ limit: 100 }, { intervalMs: 3000 });
  const all = data?.items ?? [];
  const desktop = useDesktop();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [ch, setCh] = useState(ALL);
  const [pr, setPr] = useState(ALL);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const base = useMemo(
    () =>
      all.filter(
        (n) =>
          (!q ||
            `${n.id} ${n.subject ?? ''} ${n.preview} ${n.idempotencyKey ?? ''}`
              .toLowerCase()
              .includes(q.toLowerCase())) &&
          (ch === ALL || n.preferredChannel === ch) &&
          (pr === ALL || n.priority === pr) &&
          (!onlyAttention || NEEDS_ATTENTION.includes(n.status)),
      ),
    [all, q, ch, pr, onlyAttention],
  );
  const rows = useMemo(() => base.filter(TABS.find((t) => t.id === tab)!.match), [base, tab]);
  const groups = useMemo(() => {
    const g = new Map<string, NotificationListItem[]>();
    rows.forEach((n) => g.set(dayLabel(n.createdAt), [...(g.get(dayLabel(n.createdAt)) ?? []), n]));
    return [...g.entries()];
  }, [rows]);

  // En escritorio siempre hay una notificación abierta (maestro-detalle); en móvil se abre en un Sheet.
  useEffect(() => {
    if (desktop && !rows.some((n) => n.id === sel)) setSel(rows[0]?.id ?? null);
  }, [desktop, rows, sel]);
  const selected = all.find((n) => n.id === sel) ?? null;

  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="GET /v1/notifications · consulta y seguimiento por solicitud"
      >
        <Button render={<a href="/nueva" />}>+ Nueva solicitud</Button>
      </PageHeader>

      {error && !data && <LoadError error={error} />}
      {!(error && !data) && (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="mb-3">
            <TabsList className="h-auto flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                  {t.label}
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-4 rounded-full px-1 font-mono text-[10px] tabular-nums"
                  >
                    {base.filter(t.match).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por asunto, ID o Idempotency-Key"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <FilterSelect value={ch} onChange={setCh} options={withAll('Todos los canales', CHANNEL_LABEL)} />
            <FilterSelect value={pr} onChange={setPr} options={withAll('Toda prioridad', PRIORITY_LABEL)} />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={onlyAttention} onCheckedChange={setOnlyAttention} />
              Sólo requieren atención
            </label>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="gap-0 overflow-hidden p-0">
              {groups.map(([day, items]) => (
                <section key={day}>
                  <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b bg-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {day}
                    <span className="font-normal normal-case tracking-normal">· {items.length}</span>
                  </h3>
                  {items.map((n) => (
                    <NotificationItem
                      key={n.id}
                      item={n}
                      selected={n.id === sel}
                      onSelect={(x) => setSel(x.id)}
                    />
                  ))}
                </section>
              ))}
              {rows.length === 0 && (
                <div className="grid place-items-center gap-2 px-6 py-16 text-center text-muted-foreground">
                  <BellOff className="size-8" />
                  <p className="font-medium text-foreground">
                    {loading
                      ? 'Cargando…'
                      : all.length === 0
                        ? 'Aún no hay notificaciones'
                        : 'Sin resultados'}
                  </p>
                  <p className="text-sm">
                    {all.length === 0 && !loading
                      ? 'Crea la primera con «Nueva solicitud».'
                      : 'Ajusta los filtros.'}
                  </p>
                </div>
              )}
            </Card>

            {desktop && (
              <Card className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto p-5">
                {selected ? (
                  <NotificationPanel key={selected.id} item={selected} />
                ) : (
                  <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
                    <MousePointerClick className="size-8" />
                    <p className="text-sm">Selecciona una notificación para ver su ruta.</p>
                  </div>
                )}
              </Card>
            )}
          </div>
          {!desktop && <NotificationSheet item={selected} onClose={() => setSel(null)} />}
        </>
      )}
    </>
  );
}
