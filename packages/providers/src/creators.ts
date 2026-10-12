import { SenderCreator, SenderRegistry, type NotificationSender } from '@notifyhub/application';
import type { Provider } from '@notifyhub/domain';
import { FcmPushSender, SendGridEmailSender, TwilioSmsSender, WebhookSender } from './senders';
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
