import type { DeliveryResult, NotificationSender } from '@notifyhub/application';
import { DEFAULT_ROUTING } from '@notifyhub/application';
import type { NotificationRequest, Provider } from '@notifyhub/domain';
import { recipientSupports } from '@notifyhub/domain';

/** Respuesta ya normalizada del proveedor: código HTTP, cuerpo y tiempo. */
export interface ProviderResponse {
  status: number;
  body: Record<string, unknown>;
  latencyMs: number;
  messageId?: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL',
  502: 'BAD_GATEWAY',
  503: 'UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

/** Claves que nunca se guardan de la respuesta del proveedor (datos personales). */
const SENSITIVE = new Set(['to', 'email', 'phone', 'recipient', 'token', 'deviceToken', 'body', 'text']);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => !SENSITIVE.has(key)));
}

/**
 * Template Method (NH-19): `send` fija los pasos (validar, enviar, interpretar la respuesta) y cada
 * proveedor solo implementa `doSend`. El mapeo de códigos HTTP a "reintentable o permanente" es común.
 */
export abstract class BaseSender implements NotificationSender {
  /** Si el proveedor confirma la entrega al instante (correo, SMS, push). Los webhooks no confirman. */
  protected readonly confirmsDelivery: boolean = true;

  constructor(protected readonly provider: Provider) {}

  get providerCode() {
    return this.provider.code;
  }

  get channel() {
    return this.provider.channel;
  }

  async send(request: NotificationRequest, idempotencyKey?: string): Promise<DeliveryResult> {
    const problem = this.validate(request);
    if (problem) return { ok: false, retryable: false, errorCode: problem, latencyMs: 0 };
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('PROVIDER_TIMEOUT'));
        }, DEFAULT_ROUTING.providerSendTimeoutMs);
      });
      return this.mapResponse(
        await Promise.race([this.doSend(request, idempotencyKey, controller.signal), timeout]),
      );
    } catch {
      if (controller.signal.aborted) {
        return {
          ok: false,
          retryable: true,
          errorCode: 'PROVIDER_TIMEOUT',
          latencyMs: DEFAULT_ROUTING.providerSendTimeoutMs,
        };
      }
      // Error de red o excepción del cliente: se trata como transitorio.
      return { ok: false, retryable: true, errorCode: 'NETWORK_ERROR', latencyMs: 0 };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /** Devuelve el código de error si la solicitud no se puede enviar por este canal; null si está bien. */
  protected validate(request: NotificationRequest): string | null {
    return recipientSupports(request.recipient, this.provider.channel) ? null : 'INVALID_RECIPIENT';
  }

  protected abstract doSend(
    request: NotificationRequest,
    idempotencyKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ProviderResponse>;

  protected mapResponse(response: ProviderResponse): DeliveryResult {
    if (response.status >= 200 && response.status < 300) {
      return {
        ok: true,
        providerMessageId: response.messageId ?? `${this.provider.code}-${response.latencyMs}`,
        latencyMs: response.latencyMs,
        delivered: this.confirmsDelivery,
        response: sanitize(response.body),
      };
    }
    return {
      ok: false,
      retryable: response.status === 429 || response.status >= 500,
      errorCode: `${response.status} ${STATUS_TEXT[response.status] ?? 'ERROR'}`,
      latencyMs: response.latencyMs,
      response: sanitize(response.body),
    };
  }
}
