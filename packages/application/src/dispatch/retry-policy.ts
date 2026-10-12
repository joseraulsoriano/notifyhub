export interface RetryConfig {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  jitter: boolean;
}

/** NH-28: backoff exponencial (500, 1000, 2000 ms…) con tope y jitter opcional. `retry` empieza en 1. */
export function backoffMs(config: RetryConfig, retry: number, random: () => number = Math.random): number {
  const exponential = Math.min(config.maxMs, config.baseMs * 2 ** (retry - 1));
  return config.jitter ? Math.round(exponential * (0.5 + random() / 2)) : exponential;
}
