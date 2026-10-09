import type { RateLimiter, RateLimitResult } from '@notifyhub/application';
import type { Redis } from 'ioredis';

/** Ventana fija en Redis: INCR + EXPIRE en una sola transacción, compartida entre réplicas de la API. */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const results = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').ttl(key).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }
}
