import type { Provider } from '@notifyhub/domain';
import { ProviderNotRegisteredError } from '@notifyhub/domain';
import type { NotificationSender } from './notification-sender';

/**
 * Factory Method (NH-20): cada proveedor tiene su creador, que sabe armar su emisor a partir de la
 * configuración del proveedor (salud, costo). Agregar un proveedor es registrar un creador nuevo.
 */
export abstract class SenderCreator {
  abstract createSender(provider: Provider): NotificationSender;
}

/** Catálogo de creadores por código de proveedor. */
export class SenderRegistry {
  private readonly creators = new Map<string, SenderCreator>();

  register(providerCode: string, creator: SenderCreator): this {
    this.creators.set(providerCode, creator);
    return this;
  }

  has(providerCode: string): boolean {
    return this.creators.has(providerCode);
  }

  getSender(provider: Provider): NotificationSender {
    const creator = this.creators.get(provider.code);
    if (!creator) throw new ProviderNotRegisteredError(provider.code);
    return creator.createSender(provider);
  }
}
