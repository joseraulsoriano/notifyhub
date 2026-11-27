import { SenderCreator, SenderRegistry, type NotificationSender } from '@notifyhub/application';
import type { Provider } from '@notifyhub/domain';
import {
  FcmPushSender,
  SendGridEmailSender,
  SendGridLiveSender,
  TwilioLiveSender,
  TwilioSmsSender,
  UnconfiguredSender,
  WebhookSender,
  type ProductionProviderConfig,
} from './senders';
import { SimulatedTransport } from './simulated-transport';

type SenderClass = new (provider: Provider, transport: SimulatedTransport) => NotificationSender;

/** Factory Method: un creador por proveedor, todos con la misma forma. */
class TransportSenderCreator extends SenderCreator {
  constructor(
    private readonly senderClass: SenderClass,
    private readonly transport: SimulatedTransport,
  ) {
    super();
  }

  createSender(provider: Provider): NotificationSender {
    return new this.senderClass(provider, this.transport);
  }
}

export class SendGridCreator extends TransportSenderCreator {
  constructor(transport: SimulatedTransport) {
    super(SendGridEmailSender, transport);
  }
}
export class TwilioCreator extends TransportSenderCreator {
  constructor(transport: SimulatedTransport) {
    super(TwilioSmsSender, transport);
  }
}
export class FcmCreator extends TransportSenderCreator {
  constructor(transport: SimulatedTransport) {
    super(FcmPushSender, transport);
  }
}
export class WebhookCreator extends TransportSenderCreator {
  constructor(transport: SimulatedTransport) {
    super(WebhookSender, transport);
  }
}

class DirectSenderCreator extends SenderCreator {
  constructor(private readonly create: (provider: Provider) => NotificationSender) {
    super();
  }

  createSender(provider: Provider): NotificationSender {
    return this.create(provider);
  }
}

/** Registro con los cuatro proveedores del catálogo (config/routing.yaml). */
export function createDefaultRegistry(
  transport: SimulatedTransport = new SimulatedTransport(),
): SenderRegistry {
  return new SenderRegistry()
    .register('sendgrid', new SendGridCreator(transport))
    .register('twilio', new TwilioCreator(transport))
    .register('fcm', new FcmCreator(transport))
    .register('webhook', new WebhookCreator(transport));
}

/** Registro de producción: Email/SMS reales y canales aún no integrados bloqueados explícitamente. */
export function createProductionRegistry(config: ProductionProviderConfig): SenderRegistry {
  return new SenderRegistry()
    .register(
      'sendgrid',
      new DirectSenderCreator((provider) => new SendGridLiveSender(provider, config.sendgrid)),
    )
    .register('twilio', new DirectSenderCreator((provider) => new TwilioLiveSender(provider, config.twilio)))
    .register('fcm', new DirectSenderCreator((provider) => new UnconfiguredSender(provider)))
    .register('webhook', new DirectSenderCreator((provider) => new UnconfiguredSender(provider)));
}
