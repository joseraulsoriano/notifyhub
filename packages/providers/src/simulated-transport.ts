import type { Provider } from '@notifyhub/domain';
import type { ProviderResponse } from './base-sender';

export interface SimulationOptions {
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Tope de espera real por llamada; la latencia que se reporta no se recorta. Por defecto 250 ms. */
  maxRealDelayMs?: number;
}

/** Rangos de latencia (ms) de un proveedor sano. */
const LATENCY: Record<string, [number, number]> = {
  sendgrid: [180, 260],
  twilio: [260, 340],
  fcm: [90, 160],
  webhook: [80, 130],
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Transporte simulado: reemplaza la llamada HTTP al proveedor real (SendGrid, Twilio, FCM). Su comportamiento
 * sale de la salud del proveedor, que se edita desde la API: UP responde bien, DEGRADED falla la mitad de
 * las veces y es lento, DOWN siempre responde 503. Así el fallback se puede demostrar en vivo sin credenciales.
 * Los adaptadores reales (SCRUM-29 a SCRUM-32) sustituyen este transporte sin cambiar el despachador.
 */
export class SimulatedTransport {
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRealDelayMs: number;

  constructor(options: SimulationOptions = {}) {
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? realSleep;
    this.maxRealDelayMs = options.maxRealDelayMs ?? 250;
  }

  async call(
    provider: Provider,
    successBody: Record<string, unknown>,
    messageId: string,
  ): Promise<ProviderResponse> {
    const [min, max] = LATENCY[provider.code] ?? [100, 300];
    const between = (a: number, b: number) => Math.round(a + this.random() * (b - a));
    const failing = provider.health === 'DOWN' || (provider.health === 'DEGRADED' && this.random() < 0.5);

    const latencyMs = failing
      ? between(1600, 2000)
      : provider.health === 'DEGRADED'
        ? between(max * 3, max * 5)
        : between(min, max);
    await this.sleep(Math.min(latencyMs, this.maxRealDelayMs));

    return failing
      ? { status: 503, body: { error: { code: 503, message: 'UNAVAILABLE' } }, latencyMs }
      : { status: 200, body: successBody, latencyMs, messageId };
  }
}
