import type { RateLimitResult } from '@notifyhub/application';

export interface WindowState {
  count: number;
  /** Epoch en ms en que la ventana se reinicia. */
  resetAt: number;
}

/** Ventana fija: cuenta peticiones hasta `resetAt` y empieza de cero en la siguiente. */
export function hitFixedWindow(
  previous: WindowState | undefined,
  now: number,
  limit: number,
  windowSeconds: number,
): { state: WindowState; result: RateLimitResult } {
  const state =
    previous && previous.resetAt > now
      ? { count: previous.count + 1, resetAt: previous.resetAt }
      : { count: 1, resetAt: now + windowSeconds * 1000 };
  return {
    state,
    result: {
      allowed: state.count <= limit,
      limit,
      remaining: Math.max(0, limit - state.count),
      resetSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    },
  };
}
