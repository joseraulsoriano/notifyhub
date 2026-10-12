import type { Provider } from '@notifyhub/domain';
import { ProviderNotFoundError } from '@notifyhub/domain';
import type { ProviderPatch, ProviderRepository } from '../ports';

export class ListProviders {
  constructor(private readonly providers: ProviderRepository) {}

  execute(): Promise<Provider[]> {
    return this.providers.list();
  }
}

/** Cambia la salud o el estado de un proveedor. Afecta a todos los clientes: la API restringe quién puede. */
export class UpdateProvider {
  constructor(private readonly providers: ProviderRepository) {}

  async execute(code: string, patch: ProviderPatch): Promise<Provider> {
    const updated = await this.providers.update(code, patch);
    if (!updated) throw new ProviderNotFoundError(code);
    return updated;
  }
}
