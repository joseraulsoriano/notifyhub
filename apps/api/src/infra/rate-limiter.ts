import type { RateLimiter, RateLimitResult } from '@notifyhub/application';
import { DurableObject } from 'cloudflare:workers';
import type { WindowState } from './fixed-window';
import { hitFixedWindow } from './fixed-window';

/**
 * Un Durable Object por cliente: Cloudflare garantiza que sus llamadas se atienden de una en una,
 * así que el contador no tiene carreras aunque la API corra en muchos puntos de la red.
 */
export class RateLimiterObject extends DurableObject<Env> {
  async hit(limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const previous = await this.ctx.storage.get<WindowState>('window');
    const { state, result } = hitFixedWindow(previous, Date.now(), limit, windowSeconds);
    await this.ctx.storage.put('window', state);
    return result;
  }
}

export class DurableObjectRateLimiter implements RateLimiter {
  constructor(private readonly objects: DurableObjectNamespace<RateLimiterObject>) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    return this.objects.getByName(key).hit(limit, windowSeconds);
  }
}
