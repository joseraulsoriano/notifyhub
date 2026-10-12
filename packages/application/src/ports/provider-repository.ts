import type { Provider, ProviderHealth } from '@notifyhub/domain';

export interface ProviderPatch {
  health?: ProviderHealth;
  enabled?: boolean;
}

export interface ProviderRepository {
  list(): Promise<Provider[]>;
  /** Cambia la salud o el estado de un proveedor; devuelve null si no existe. */
  update(code: string, patch: ProviderPatch): Promise<Provider | null>;
}
