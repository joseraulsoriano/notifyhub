import { NotifyHubProvider } from '@notifyhub/ui';
import type { ReactNode } from 'react';
import { useConnection } from '@/lib/connection';

/** Cada página de Astro es su propia isla de React: este envoltorio le da el cliente (real o demo). */
export function Page({ children }: { children: ReactNode }) {
  const { client } = useConnection();
  return <NotifyHubProvider client={client}>{children}</NotifyHubProvider>;
}
