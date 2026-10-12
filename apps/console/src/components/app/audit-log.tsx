import type { AuditEntry } from '@notifyhub/client';
import { ChannelTag, StatusBadge, useAuditLog } from '@notifyhub/ui';
import { Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FilterSelect } from './filter-select';
import { Page } from './page';
import { LoadError, PageHeader } from './page-header';

const EVENTS = ['notification.received', 'notification.status_changed', 'delivery.attempt'];
const UUID = /^[0-9a-f-]{36}$/i;
const time = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour12: false });

function toCsv(rows: AuditEntry[]): string {
  const head = ['hora', 'notificacion', 'evento', 'de', 'a', 'canal', 'proveedor'];
  const lines = rows.map((r) =>
    [
      r.occurredAt,
      r.notificationId,
      r.eventType,
      r.fromStatus ?? '',
      r.toStatus,
      r.channel ?? '',
      r.providerCode ?? '',
    ].join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export function AuditLog() {
  return (
    <Page>
      <AuditView />
    </Page>
  );
}

function AuditView() {
  // ?notificationId=… viene del botón «Ver en bitácora» del detalle.
  const initial =
    typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('notificationId') ?? '') : '';
  const [q, setQ] = useState(initial);
  const [ev, setEv] = useState('all');
  const { data, error, loading } = useAuditLog(
    { limit: 200, ...(UUID.test(initial) ? { notificationId: initial } : {}) },
    { intervalMs: 5000 },
  );
  const rows = useMemo(
    () =>
      (data?.items ?? []).filter(
        (r) =>
          (ev === 'all' || r.eventType === ev) &&
          (!q ||
            `${r.notificationId} ${r.providerCode ?? ''} ${r.eventType}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [data, q, ev],
  );

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'bitacora.csv' }).click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} filas exportadas`);
  };

  return (
    <>
      <PageHeader
        title="Bitácora de auditoría"
        description="GET /v1/audit-log · append-only · datos personales enmascarados"
      >
        <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download /> Exportar CSV
        </Button>
      </PageHeader>
      {error && !data ? (
        <LoadError error={error} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Filtrar por notificación, evento o proveedor"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <FilterSelect
              value={ev}
              onChange={setEv}
              className="w-60"
              options={[
                { value: 'all', label: 'Todos los eventos' },
                ...EVENTS.map((e) => ({ value: e, label: e })),
              ]}
            />
          </div>
          <Card className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Notificación</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>De → A</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Proveedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{time(r.occurredAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.notificationId.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.eventType}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        {r.fromStatus ? (
                          <StatusBadge status={r.fromStatus} />
                        ) : (
                          <span className="text-muted-foreground">∅</span>
                        )}{' '}
                        → <StatusBadge status={r.toStatus} />
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.channel ? (
                        <ChannelTag channel={r.channel} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.providerCode ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {loading ? 'Cargando…' : 'Sin entradas para estos filtros'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
