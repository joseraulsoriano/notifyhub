import type { Channel, Recipient } from '@notifyhub/domain';

/**
 * Enmascara el dato de contacto del canal (política de datos personales, NH-32): la consola y las respuestas
 * de lista nunca devuelven el correo, teléfono, token o URL completos.
 */
export function maskRecipient(recipient: Recipient, channel: Channel): string {
  switch (channel) {
    case 'EMAIL': {
      const [local = '', domain = ''] = (recipient.email ?? '').split('@');
      return local ? `${local[0]}***@${domain}` : '';
    }
    case 'SMS': {
      const digits = (recipient.phone ?? '').replace(/\D/g, '');
      return digits.length >= 6 ? `+${digits.slice(0, 2)} ****-${digits.slice(-4)}` : '';
    }
    case 'PUSH': {
      const token = recipient.deviceToken ?? '';
      return token.length >= 8 ? `${token.slice(0, 4)}••••${token.slice(-4)}` : '';
    }
    case 'WEBHOOK': {
      try {
        return `${new URL(recipient.webhookUrl ?? '').origin}/…`;
      } catch {
        return '';
      }
    }
  }
}
