import { shellLink, navigateShell } from '@notifyhub/mfe-runtime';
import { NotifyHubError, type Channel, type Priority } from '@notifyhub/client';
import {
  CHANNEL_BG,
  CHANNEL_LABEL,
  PRIORITY_LABEL,
  RoutePreview,
  useNotifyHubClient,
  useProviders,
} from '@notifyhub/ui';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { notify } from '@notifyhub/mfe-runtime';
import { Button } from '@notifyhub/mfe-runtime/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@notifyhub/mfe-runtime/ui/card';
import { Input } from '@notifyhub/mfe-runtime/ui/input';
import { Label } from '@notifyhub/mfe-runtime/ui/label';
import { Textarea } from '@notifyhub/mfe-runtime/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@notifyhub/mfe-runtime/ui/toggle-group';
import { CONTACT_FIELD, FALLBACK_CHAINS } from '@notifyhub/mfe-runtime';
import { Page } from '@notifyhub/mfe-runtime';
import { PageHeader } from '@notifyhub/mfe-runtime';

const CHANNELS: Channel[] = ['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'];
const LABEL: Record<Channel, string> = {
  EMAIL: 'Correo',
  SMS: 'Teléfono (E.164)',
  PUSH: 'Token de dispositivo',
  WEBHOOK: 'URL del webhook (https)',
};
const PRESSED = 'data-[pressed]:border-foreground data-[pressed]:bg-secondary data-[pressed]:text-foreground';
const QUEUE: Record<Priority, string> = { HIGH: 'alta', MEDIUM: 'media', LOW: 'baja' };

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px] font-semibold">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold leading-5">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function NewNotification() {
  return (
    <Page>
      <NewView />
    </Page>
  );
}

function NewView() {
  const client = useNotifyHubClient();
  const { data: providers } = useProviders();
  const [channel, setChannel] = useState<Channel>('EMAIL');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [contact, setContact] = useState({
    email: '',
    phone: '',
    deviceToken: '',
    webhookUrl: '',
  });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [key, setKey] = useState(() => `consola-${Math.random().toString(36).slice(2, 8)}`);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const field = CONTACT_FIELD[channel];
  const fallback = FALLBACK_CHAINS[channel].find((c) => contact[CONTACT_FIELD[c]].trim());
  // Solo se mandan los datos de contacto con valor: son los canales de respaldo disponibles.
  const recipient = Object.fromEntries(Object.entries(contact).filter(([, v]) => v.trim()));
  const payload = {
    sender: { name: 'Consola NotifyHub' },
    recipient,
    message: { ...(subject.trim() ? { subject: subject.trim() } : {}), body },
    priority,
    preferredChannel: channel,
  };
  const providerNames = Object.fromEntries((providers ?? []).map((p) => [p.channel, p.code])) as Partial<
    Record<Channel, string>
  >;

  const submit = async () => {
    setBusy(true);
    setProblems([]);
    try {
      const created = await client.notifications.create(payload, { idempotencyKey: key });
      notify.success(
        created.replayed
          ? 'Ya existía una solicitud con esa Idempotency-Key'
          : 'Solicitud aceptada · 202 · encolada',
      );
      setTimeout(() => navigateShell('/notificaciones'), 600);
    } catch (e) {
      if (e instanceof NotifyHubError)
        setProblems(
          e.errors?.length
            ? e.errors.map((x) => `${x.path || 'solicitud'}: ${x.message}`)
            : [e.detail ?? e.title],
        );
      else setProblems([e instanceof Error ? e.message : 'Error desconocido']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Nueva solicitud"
        description="POST /v1/notifications · valida, persiste y encola por prioridad"
      />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card>
          <CardContent className="space-y-7">
            <Section n={1} title="Cómo se envía" hint="Canal de salida y cola de prioridad">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label>Canal preferido</Label>
                  <ToggleGroup
                    value={[channel]}
                    onValueChange={(v) => v[0] && setChannel(v[0] as Channel)}
                    variant="outline"
                    className="flex-wrap"
                  >
                    {CHANNELS.map((c) => (
                      <ToggleGroupItem key={c} value={c} className={`gap-1.5 px-3 ${PRESSED}`}>
                        <i className={`inline-block h-1 w-4 rounded-full ${CHANNEL_BG[c]}`} />
                        {CHANNEL_LABEL[c]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="space-y-2">
                  <Label>Prioridad</Label>
                  <ToggleGroup
                    value={[priority]}
                    onValueChange={(v) => v[0] && setPriority(v[0] as Priority)}
                    variant="outline"
                  >
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <ToggleGroupItem key={p} value={p} className={`px-4 ${PRESSED}`}>
                        {PRIORITY_LABEL[p]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>
            </Section>

            <Section n={2} title="A quién" hint="Destinatario y contactos por si el canal falla">
              <div className="space-y-2">
                <Label htmlFor="to">{LABEL[channel]}</Label>
                <Input
                  id="to"
                  value={contact[field]}
                  onChange={(e) => setContact({ ...contact, [field]: e.target.value })}
                />
              </div>
              <fieldset className="space-y-3 rounded-lg border bg-secondary/40 p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  Contactos de respaldo (para el fallback)
                </legend>
                {CHANNELS.filter((c) => c !== channel).map((c) => (
                  <div key={c} className="grid grid-cols-[110px_1fr] items-center gap-3">
                    <Label htmlFor={`c-${c}`} className="text-xs">
                      {CHANNEL_LABEL[c]}
                    </Label>
                    <Input
                      id={`c-${c}`}
                      className="h-8 bg-card font-mono text-xs"
                      value={contact[CONTACT_FIELD[c]]}
                      onChange={(e) => setContact({ ...contact, [CONTACT_FIELD[c]]: e.target.value })}
                    />
                  </div>
                ))}
              </fieldset>
            </Section>

            <Section n={3} title="Qué se envía" hint="Contenido y llave de idempotencia">
              <div className="space-y-2">
                <Label htmlFor="subj">Asunto</Label>
                <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Mensaje</Label>
                <Textarea id="body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key">Idempotency-Key</Label>
                <Input id="key" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Reenviar con la misma llave no duplica la solicitud.
                </p>
              </div>
            </Section>

            {problems.length > 0 && (
              <ul
                role="alert"
                className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 border-t pt-5">
              <Button onClick={submit} disabled={busy}>
                <Send /> {busy ? 'Enviando…' : 'Enviar notificación'}
              </Button>
              <Button variant="outline" render={<a {...shellLink('/notificaciones')} />}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 self-start md:sticky md:top-16">
          <Card>
            <CardHeader>
              <CardTitle>Ruta prevista</CardTitle>
              <CardDescription>Así viajará la solicitud desde que llega hasta la entrega</CardDescription>
            </CardHeader>
            <CardContent>
              {fallback ? (
                <RoutePreview
                  queue={QUEUE[priority]}
                  channel={channel}
                  fallback={fallback}
                  providers={providerNames}
                />
              ) : (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Sin datos de contacto de respaldo: si {CHANNEL_LABEL[channel]} falla, la notificación
                  quedará como fallida.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                La factoría crea el emisor del canal; si el proveedor falla, la estrategia pasa al siguiente
                canal con dato de contacto.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Solicitud a la API</CardTitle>
              <CardDescription>JSON que se envía</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-72 overflow-auto rounded-lg bg-primary p-4 font-mono text-xs text-primary-foreground">{`POST /v1/notifications\nIdempotency-Key: ${key}\n\n${JSON.stringify(payload, null, 2)}`}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
