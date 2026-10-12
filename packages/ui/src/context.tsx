import type { NotifyHubClient } from '@notifyhub/client';
import { createContext, useContext, type ReactNode } from 'react';

const ClientContext = createContext<NotifyHubClient | null>(null);

/** Entrega el cliente de la API (real o simulado) a los hooks de la librería. */
export function NotifyHubProvider({ client, children }: { client: NotifyHubClient; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useNotifyHubClient(): NotifyHubClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useNotifyHubClient debe usarse dentro de <NotifyHubProvider client={…}>');
  return client;
}
