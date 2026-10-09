export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos que faltan para que se reinicie la ventana. */
  resetSeconds: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
