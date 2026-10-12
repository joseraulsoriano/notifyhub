import { StatusBadge } from '@notifyhub/ui';
import { Webhook } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConnection } from '@/lib/connection';
import { Page } from './page';
import { PageHeader } from './page-header';

/** Datos de ejemplo del modo demo: la API de suscripciones llega con SCRUM-45. */
const SAMPLE = [
  {
    name: 'ERP Facturación',
    url: 'https://erp.cliente.mx/hooks/nh',
    events: 'notification.sent, notification.failed',
    rate: 99.8,
    last: 'hace 1 min',
    on: true,
  },
  {
    name: 'CRM Clientes',
    url: 'https://crm.cliente.mx/api/events',
    events: 'notification.delivered',
    rate: 97.2,
    last: 'hace 3 min',
    on: true,
  },
  {
    name: 'Panel de soporte',
    url: 'https://soporte.cliente.mx/nh',
    events: 'notification.failed',
    rate: 100,
    last: 'hace 12 min',
    on: true,
  },
  {
    name: 'Analítica (staging)',
    url: 'https://analytics.stg.mx/in',
    events: '*',
    rate: 62.5,
    last: 'hace 2 h',
    on: false,
  },
];

export function SubscriptionsPage() {
  return (
    <Page>
      <SubscriptionsView />
    </Page>
  );
}

function SubscriptionsView() {
  const { connection } = useConnection();
  const [subs, setSubs] = useState(SAMPLE);
  return (
    <>
      <PageHeader
        title="Suscripciones"
        description="Observer · eventos publicados vía outbox y Redis Streams (SCRUM-43 a SCRUM-45)"
      >
        <Button onClick={() => toast('Disponible con SCRUM-45')} disabled={connection.mode === 'live'}>
          + Nueva suscripción
        </Button>
      </PageHeader>
      {connection.mode === 'live' ? (
        <Card className="grid place-items-center gap-3 px-6 py-16 text-center">
          <Webhook className="size-8 text-muted-foreground" />
          <p className="font-heading text-lg font-bold">Las suscripciones llegan con SCRUM-45</p>
          <p className="max-w-md text-sm text-muted-foreground">
            El despachador ya publica cada cambio de estado como evento (patrón Observer). Falta el outbox
            transaccional y la entrega a los suscriptores por webhook; esta pantalla se conectará a esa API.
          </p>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">Datos de ejemplo del modo demo.</p>
          <Card className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Suscriptor</TableHead>
                  <TableHead>URL destino</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Éxito</TableHead>
                  <TableHead>Último envío</TableHead>
                  <TableHead>Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.url}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.events}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={s.rate > 95 ? 'UP' : s.rate > 80 ? 'DEGRADED' : 'DOWN'}
                        label={`${s.rate}%`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.last}</TableCell>
                    <TableCell>
                      <Switch
                        checked={s.on}
                        onCheckedChange={(v) =>
                          setSubs((l) => l.map((x) => (x.name === s.name ? { ...x, on: v } : x)))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
