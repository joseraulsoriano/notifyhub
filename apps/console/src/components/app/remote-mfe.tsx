import { MESSAGE, answerRpc, isRpcMethod, useConnection } from '@notifyhub/mfe-runtime';
import { useEffect, useMemo, useRef, useState } from 'react';

type RemoteMfeProps = { name: string; src: string; title: string };

/** Lo que tarda en mostrarse un MFE antes de dar por hecho que su Worker no responde. */
const LOAD_TIMEOUT_MS = 8000;

/**
 * Monta el microfrontend dueño de la ruta. Le pasa la conexión de esta pestaña por `postMessage` (la API
 * key nunca va en la URL), ajusta el iframe al alto de su contenido, deja que pida navegar a otra ruta
 * del shell y, en modo demo, le responde con el cliente demo del shell para que todos compartan los datos.
 */
export function RemoteMfe({ name, src, title }: RemoteMfeProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { connection, client } = useConnection();
  const [height, setHeight] = useState(640);
  const [state, setState] = useState<'loading' | 'ready' | 'unreachable'>('loading');
  // Antes del `ready` el iframe todavía es about:blank: mandarle algo solo genera avisos en la consola.
  const ready = useRef(false);

  // Los parámetros de la ruta del shell (p. ej. ?notificationId=) llegan también al MFE.
  const url = useMemo(() => {
    const target = new URL(src, typeof window === 'undefined' ? 'http://localhost' : window.location.href);
    if (typeof window !== 'undefined')
      new URLSearchParams(window.location.search).forEach((value, key) =>
        target.searchParams.set(key, value),
      );
    return target;
  }, [src]);

  useEffect(() => {
    const origin = url.origin;
    const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, origin);
    const sendConnection = () => send({ type: MESSAGE.connection, connection });

    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      const data = event.data as Record<string, unknown> | undefined;
      switch (data?.type) {
        case MESSAGE.ready:
          ready.current = true;
          setState('ready');
          sendConnection();
          break;
        case MESSAGE.height:
          if (typeof data.height === 'number' && data.height > 0) setHeight(Math.ceil(data.height));
          break;
        case MESSAGE.navigate:
          // Solo rutas internas del shell: nunca otra página u origen.
          if (typeof data.path === 'string' && data.path.startsWith('/') && !data.path.startsWith('//'))
            window.location.assign(data.path);
          break;
        case MESSAGE.rpc:
          // Solo en demo: conectado a la API real, cada MFE le habla a la API directamente.
          if (connection.mode !== 'demo' || typeof data.id !== 'string' || !isRpcMethod(data.method)) return;
          send(
            await answerRpc(client, {
              type: MESSAGE.rpc,
              id: data.id,
              method: data.method,
              args: Array.isArray(data.args) ? data.args : [],
            }),
          );
          break;
      }
    };

    window.addEventListener('message', receive);
    // Si la conexión cambia con el MFE ya cargado (p. ej. al conectar la API), se le avisa de inmediato.
    if (ready.current) sendConnection();
    return () => window.removeEventListener('message', receive);
  }, [url, connection, client]);

  useEffect(() => {
    if (state !== 'loading') return;
    const timer = window.setTimeout(() => setState('unreachable'), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div className="relative">
      {state === 'unreachable' && (
        <div className="mb-4 rounded-lg border border-transfer/40 bg-transfer/10 p-4 text-sm">
          <p className="font-semibold">No se pudo cargar el módulo «{title}».</p>
          <p className="mt-1 text-muted-foreground">
            El microfrontend <code className="font-mono text-xs">{name}</code> no respondió en{' '}
            <code className="font-mono text-xs">{url.origin}</code>. En local, levántalo con{' '}
            <code className="font-mono text-xs">pnpm dev:console</code>.
          </p>
        </div>
      )}
      <iframe
        ref={frame}
        title={title}
        src={url.toString()}
        data-microfrontend={name}
        className="block w-full border-0 bg-transparent transition-[height] duration-150"
        style={{ height }}
      />
    </div>
  );
}
