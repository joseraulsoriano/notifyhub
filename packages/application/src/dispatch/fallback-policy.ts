import type { Channel, Recipient } from '@notifyhub/domain';
import { recipientSupports } from '@notifyhub/domain';

/** NH-27: cadena de canales a intentar. Solo entran los canales para los que hay dato de contacto. */
export class FallbackPolicy {
  constructor(private readonly chains: Record<Channel, readonly Channel[]>) {}

  channelsFor(recipient: Recipient, preferred: Channel): Channel[] {
    const chain = [preferred, ...this.chains[preferred]];
    return [...new Set(chain)].filter(
      (channel) => channel === preferred || recipientSupports(recipient, channel),
    );
  }
}
