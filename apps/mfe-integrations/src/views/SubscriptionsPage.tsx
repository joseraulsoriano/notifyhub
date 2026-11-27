import type {
  CreateSubscriptionInput,
  NotificationSubscription,
  SubscriptionEventType,
} from '@notifyhub/client';
import { Info, Plus, Webhook } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { notify } from '@notifyhub/mfe-runtime';
import { Badge } from '@notifyhub/mfe-runtime/ui/badge';
import { Button } from '@notifyhub/mfe-runtime/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@notifyhub/mfe-runtime/ui/card';
import { Input } from '@notifyhub/mfe-runtime/ui/input';
import { Label } from '@notifyhub/mfe-runtime/ui/label';
import { Switch } from '@notifyhub/mfe-runtime/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@notifyhub/mfe-runtime/ui/table';
import { useConnection } from '@notifyhub/mfe-runtime';
import { useNotifyHubClient } from '@notifyhub/ui';
import { Page } from '@notifyhub/mfe-runtime';
import { PageHeader } from '@notifyhub/mfe-runtime';

const EVENTS: { value: SubscriptionEventType; label: string }[] = [
  { value: 'notification.status_changed', label: 'Cambio de estado' },
  { value: 'notification.attempted', label: 'Intento de entrega' },
];
const DEFAULT_WEBHOOK_URL = 'https://notify.sc202357155.workers.dev/notify';

export function SubscriptionsPage() {
  return (
    <Page>
      <SubscriptionsView />
    </Page>
  );
}

function SubscriptionsView() {
  const client = useNotifyHubClient();
  const { connection } = useConnection();
  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [events, setEvents] = useState<SubscriptionEventType[]>(['notification.status_changed']);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSubscriptions(await client.subscriptions.list());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input: CreateSubscriptionInput = {
        subscriberName: name.trim(),
        targetUrl: url.trim(),
        eventTypes: events,
      };
      const created = await client.subscriptions.create(input);
      setSigningSecret(created.signingSecret);
      setName('');
      setUrl(DEFAULT_WEBHOOK_URL);
      setEvents(['notification.status_changed']);
      setFormOpen(false);
      notify.success('Suscripción registrada');
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'No se pudo crear la suscripción');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (subscription: NotificationSubscription, active: boolean) => {
    try {
      const updated = await client.subscriptions.setActive(subscription.id, active);
      setSubscriptions((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'No se pudo actualizar la suscripción');
    }
  };

  const toggleEvent = (value: SubscriptionEventType, checked: boolean) => {
    setEvents((current) =>
      checked ? [...current, value] : current.filter((eventType) => eventType !== value),
    );
  };

  return (
    <>
      <PageHeader
        title="Suscripciones"
        description="Registra destinos HTTPS para eventos del servicio (API: /v1/subscriptions)"
      >
        <Button onClick={() => setFormOpen((open) => !open)}>
          <Plus /> {formOpen ? 'Cancelar' : 'Nueva suscripción'}
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Los eventos se envían a destinos HTTPS activos y se firman con <code>X-Signature</code>. La entrega
          es al menos una vez; usa <code>X-NotifyHub-Event-Id</code> para deduplicarlos.
        </p>
      </div>

      {connection.mode === 'demo' && (
        <p className="mb-3 text-xs text-muted-foreground">
          Modo demo: los registros se guardan en esta pestaña; no se contacta ningún servidor.
        </p>
      )}

      {signingSecret && (
        <Card className="mb-4 border-primary/40">
          <CardHeader>
            <CardTitle>Secreto de firma · se muestra una sola vez</CardTitle>
            <CardDescription>
              Guárdalo de forma segura. No vuelvas a cargarlo aquí: la API solo conserva su hash.
              {connection.mode === 'demo' && ' Este secreto de demo no firma entregas reales.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block overflow-x-auto rounded bg-muted p-3 text-xs">{signingSecret}</code>
            <Button className="mt-3" variant="outline" onClick={() => setSigningSecret(null)}>
              Ya lo guardé
            </Button>
          </CardContent>
        </Card>
      )}

      {formOpen && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Nueva suscripción de eventos</CardTitle>
            <CardDescription>
              El destino de prueba es la bandeja de Cloudflare Notify. El secreto se mostrará una sola vez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={create}>
              <div className="grid gap-1.5">
                <Label htmlFor="subscription-name">Nombre del sistema</Label>
                <Input
                  id="subscription-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="subscription-url">URL del webhook</Label>
                <Input
                  id="subscription-url"
                  type="url"
                  required
                  placeholder={DEFAULT_WEBHOOK_URL}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Eventos que recibirá</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EVENTS.map((item) => {
                    const on = events.includes(item.value);
                    return (
                      <label
                        key={item.value}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
                          on ? 'border-primary bg-secondary' : 'hover:bg-secondary/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={on}
                          onChange={(event) => toggleEvent(item.value, event.target.checked)}
                        />
                        <span>
                          <span className="block font-medium">{item.label}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{item.value}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <Button type="submit" disabled={saving || events.length === 0}>
                <Webhook /> {saving ? 'Guardando…' : 'Crear suscripción'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loadError ? (
        <Card className="p-5 text-sm text-destructive" role="alert">
          <p className="font-semibold">No se pudieron cargar las suscripciones</p>
          <p className="mt-1">{loadError}</p>
          <Button className="mt-3" variant="outline" onClick={() => void load()}>
            Reintentar
          </Button>
        </Card>
      ) : loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Cargando suscripciones…</Card>
      ) : subscriptions.length === 0 ? (
        <Card className="grid place-items-center gap-3 px-6 py-16 text-center">
          <Webhook className="size-8 text-muted-foreground" />
          <p className="font-heading text-lg font-bold">Todavía no hay suscripciones</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Registra un sistema destino para dejar preparada su configuración de eventos.
          </p>
          {!formOpen && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> Nueva suscripción
            </Button>
          )}
        </Card>
      ) : (
        <Card className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destino</TableHead>
                <TableHead>Escucha</TableHead>
                <TableHead className="w-40">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <p className="font-medium">{subscription.subscriberName}</p>
                    <p className="max-w-[26rem] truncate font-mono text-xs text-muted-foreground">
                      {subscription.targetUrl}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">
                        {subscription.eventTypes.length}{' '}
                        {subscription.eventTypes.length === 1 ? 'evento' : 'eventos'}
                      </span>
                      {subscription.eventTypes.map((eventType) => (
                        <Badge key={eventType} variant="secondary" className="font-mono text-[10px]">
                          {eventType}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={subscription.active}
                        onCheckedChange={(active) => void setActive(subscription, active)}
                        aria-label={`Activar ${subscription.subscriberName}`}
                      />
                      <span
                        className={`text-xs font-medium ${subscription.active ? 'text-success' : 'text-muted-foreground'}`}
                      >
                        {subscription.active ? 'Activa' : 'Pausada'}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
