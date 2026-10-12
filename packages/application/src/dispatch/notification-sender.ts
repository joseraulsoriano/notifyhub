import type { Channel, NotificationRequest } from '@notifyhub/domain';

/** Resultado de un envío. `retryable` distingue un error transitorio (5xx, timeout) de uno permanente (4xx). */
export type DeliveryResult =
  | {
      ok: true;
      providerMessageId: string;
      latencyMs: number;
      /** El proveedor confirmó la entrega (SENT → DELIVERED). Los webhooks no confirman. */
      delivered: boolean;
      response?: Record<string, unknown>;
    }
  | {
      ok: false;
      retryable: boolean;
      errorCode: string;
      latencyMs: number;
      response?: Record<string, unknown>;
    };

/** NH-19: lo que el despachador necesita de cualquier proveedor. Ver docs/diagrams/03-clases-patrones.mmd. */
export interface NotificationSender {
  readonly providerCode: string;
  readonly channel: Channel;
  send(request: NotificationRequest): Promise<DeliveryResult>;
}
