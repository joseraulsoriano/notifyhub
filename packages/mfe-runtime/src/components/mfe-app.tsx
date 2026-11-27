import { Logo } from '@notifyhub/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from '../ui/sonner';
import { isEmbedded, reportHeight, shellLink } from '../lib/bridge';
import { listenToShell } from '../lib/connection';
import { ConnectionButton } from './connection-dialog';

/**
 * Marco común de cada microfrontend. Embebido en el shell solo pinta el contenido (el shell ya trae la
 * barra lateral, la ruta y el botón de conexión) y le reporta su alto. Suelto, agrega una cabecera mínima
 * con la misma identidad para poder probarlo y desplegarlo por separado.
 */
export function MfeApp({ title, children }: { title: string; children: ReactNode }) {
  // Se decide al montar: en el servidor no se sabe si la página quedará dentro de un iframe.
  const [embedded, setEmbedded] = useState<boolean | null>(null);

  useEffect(() => {
    const inShell = isEmbedded();
    setEmbedded(inShell);
    if (!inShell) return;
    const stopListening = listenToShell();
    const stopReporting = reportHeight();
    return () => {
      stopListening();
      stopReporting();
    };
  }, []);

  if (embedded === null) return null;

  if (embedded)
    return (
      <>
        <div className="px-px pb-6">{children}</div>
        <Toaster position="top-center" />
      </>
    );

  return (
    <>
      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b bg-card px-4">
        <a {...shellLink('/')} aria-label="Ir a la consola de NotifyHub">
          <Logo />
        </a>
        <span className="text-ink-3">/</span>
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          microfrontend
        </span>
        <div className="ml-auto">
          <ConnectionButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] p-6 md:px-8 md:py-7">{children}</main>
      <Toaster position="bottom-center" />
    </>
  );
}
