import { NotifyHubError, createNotifyHubClient } from '@notifyhub/client';
import { Plug, Unplug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_API_URL, setConnection, useConnection } from '@/lib/connection';

/** Traduce el error del SDK a algo que el usuario pueda corregir. */
function explain(error: unknown): string {
  if (error instanceof NotifyHubError) {
    if (error.status === 0)
      return 'No se pudo conectar. Revisa la URL y que el origen de esta consola esté en CORS_ALLOWED_ORIGINS de la API.';
    if (error.status === 401) return 'La API key es inválida o fue revocada.';
    if (error.status === 429) return `Demasiadas solicitudes. Espera ${error.retryAfterSeconds ?? 60} s.`;
    return error.detail ?? error.title;
  }
  return error instanceof Error ? error.message : 'Error desconocido';
}

function ConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { connection } = useConnection();
  const [url, setUrl] = useState(connection.mode === 'live' ? connection.baseUrl : DEFAULT_API_URL);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const baseUrl = url.trim().replace(/\/+$/, '');
      // Pedir los proveedores comprueba a la vez la URL, el CORS y la API key.
      await createNotifyHubClient({ baseUrl, apiKey: key.trim() }).providers.list();
      setConnection({ mode: 'live', baseUrl, apiKey: key.trim() });
      setKey('');
      toast.success('Conectado a la API');
      onOpenChange(false);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    setConnection({ mode: 'demo' });
    toast('Modo demo: datos de ejemplo, sin servidor');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar con la API</DialogTitle>
          <DialogDescription>
            {connection.mode === 'live'
              ? `Conectado a ${new URL(connection.baseUrl).host}.`
              : 'Ahora ves datos de ejemplo. Conecta tu API de NotifyHub para ver notificaciones reales.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={connect} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="api-url">URL de la API</Label>
            <Input
              id="api-url"
              type="url"
              required
              placeholder="https://notifyhub-api.tu-cuenta.workers.dev"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              required
              autoComplete="off"
              placeholder="nh_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Se guarda solo en esta pestaña y se borra al cerrarla. No se envía a ningún otro sitio.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            {connection.mode === 'live' && (
              <Button type="button" variant="outline" onClick={useDemo}>
                <Unplug /> Desconectar
              </Button>
            )}
            {connection.mode === 'demo' && (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Seguir en demo
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              <Plug /> {busy ? 'Probando…' : 'Probar y conectar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botón de la barra superior: muestra a qué se está conectado y abre el diálogo. */
export function ConnectionButton() {
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const live = connection.mode === 'live';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:border-ink-3"
      >
        <span
          className={live ? 'size-2 rounded-full bg-success' : 'size-2 rounded-full border-2 border-ink-3'}
        />
        {live ? new URL(connection.baseUrl).host : 'Modo demo'}
        <span className="text-muted-foreground">· Conectar</span>
      </button>
      <ConnectionDialog key={String(open)} open={open} onOpenChange={setOpen} />
    </>
  );
}
