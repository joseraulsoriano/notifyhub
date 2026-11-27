import { MESSAGE, NOTIFY_EVENT, parseNotification } from '@notifyhub/mfe-runtime';
import { TF_MESSAGE } from '@taskflow/kit';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session-store';

const LOAD_TIMEOUT_MS = 9000;

/**
 * Monta un microfrontend por `iframe`. Le entrega la sesión por `postMessage` al origen exacto del MFE (el
 * JWT nunca va en una URL), ajusta el alto, y recibe sus avisos para el módulo centralizado de
 * notificaciones fijando `sourceMfe` según el iframe, no según lo que el mensaje diga.
 */
export function RemoteMfe({ name, src, title }: { name: string; src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const session = useSession();
  const ready = useRef(false);
  const [height, setHeight] = useState(640);
  const [state, setState] = useState<'loading' | 'ready' | 'unreachable'>('loading');
  const origin = new URL(src).origin;

  const sendSession = () =>
    frame.current?.contentWindow?.postMessage({ type: TF_MESSAGE.session, session }, origin);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      const data = event.data as Record<string, unknown> | undefined;
      switch (data?.type) {
        case TF_MESSAGE.ready:
          ready.current = true;
          setState('ready');
          sendSession();
          break;
        case MESSAGE.height:
          if (typeof data.height === 'number' && data.height > 0) setHeight(Math.ceil(data.height));
          break;
        case MESSAGE.navigate:
          if (typeof data.path === 'string' && data.path.startsWith('/') && !data.path.startsWith('//'))
            window.location.assign(data.path);
          break;
        case MESSAGE.notify: {
          const item = parseNotification(data.payload, { sourceMfe: name });
          if (item) window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: item }));
          break;
        }
      }
    };
    window.addEventListener('message', receive);
    // Si la sesión cambia con el MFE ya cargado (login, logout, expiración) se le avisa de inmediato.
    if (ready.current) sendSession();
    return () => window.removeEventListener('message', receive);
  }, [session, origin, name]);

  useEffect(() => {
    if (state !== 'loading') return;
    const timer = window.setTimeout(() => setState('unreachable'), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div>
      {state === 'unreachable' && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No se pudo cargar el módulo «{title}» desde <code className="font-mono text-xs">{origin}</code>.
        </div>
      )}
      <iframe
        ref={frame}
        title={title}
        src={src}
        data-microfrontend={name}
        // El iframe debe poder decir quién es su shell aunque el documento use una política más estricta.
        referrerPolicy="origin"
        className="block w-full border-0 bg-transparent transition-[height] duration-150"
        style={{ height }}
      />
    </div>
  );
}
