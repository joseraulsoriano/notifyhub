import { isEmbedded, reportHeight } from '@notifyhub/mfe-runtime';
import { useEffect, useState, type ReactNode } from 'react';
import { listenForSession } from '../bridge';

/**
 * Marco común de cada microfrontend de TaskFlow. Embebido, solo pinta el contenido, le reporta su alto al
 * shell y pide la sesión. Suelto, avisa que hay que abrirlo desde el shell (el JWT solo lo tiene el shell).
 */
export function TfApp({ title, shellUrl, children }: { title: string; shellUrl: string; children: ReactNode }) {
  const [embedded, setEmbedded] = useState<boolean | null>(null);

  useEffect(() => {
    const inShell = isEmbedded();
    setEmbedded(inShell);
    if (!inShell) return;
    listenForSession();
    return reportHeight();
  }, []);

  if (embedded === null) return null;
  if (embedded) return <div className="px-px pb-6">{children}</div>;

  return (
    <main className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">
        Este módulo es un microfrontend: se usa dentro de la consola de TaskFlow, que es la que guarda tu sesión.
      </p>
      <a className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href={shellUrl}>
        Abrir TaskFlow
      </a>
    </main>
  );
}
