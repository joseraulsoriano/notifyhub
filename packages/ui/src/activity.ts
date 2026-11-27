import type { NotificationListItem } from '@notifyhub/client';

/** Cómo termina (o va) cada notificación, para colorear el histograma. */
export type Outcome = 'ok' | 'fallback' | 'failed' | 'pending';
export const OUTCOMES: readonly Outcome[] = ['ok', 'fallback', 'failed', 'pending'];

export interface ActivityBucket {
  /** Inicio del intervalo (ms desde epoch). */
  start: number;
  end: number;
  counts: Record<Outcome, number>;
  total: number;
}

export function outcomeOf(item: Pick<NotificationListItem, 'status' | 'usedFallback'>): Outcome {
  if (item.status === 'FAILED') return 'failed';
  if (item.status === 'DELIVERED' || item.status === 'SENT') return item.usedFallback ? 'fallback' : 'ok';
  return 'pending';
}

const MIN_WINDOW_MS = 10 * 60_000;
const MAX_WINDOW_MS = 24 * 3_600_000;

/**
 * Reparte las notificaciones en `buckets` intervalos iguales que terminan en `now`. La ventana se ajusta a los
 * datos (de la más antigua a ahora), con un mínimo de 10 minutos y un máximo de 24 horas.
 */
export function bucketize(
  items: readonly Pick<NotificationListItem, 'createdAt' | 'status' | 'usedFallback'>[],
  now: number,
  buckets = 24,
): ActivityBucket[] {
  const times = items.map((i) => Date.parse(i.createdAt)).filter((t) => Number.isFinite(t) && t <= now);
  const oldest = times.length ? Math.min(...times) : now;
  const window = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, now - oldest + 1));
  const size = window / buckets;
  const from = now - window;
  const result: ActivityBucket[] = Array.from({ length: buckets }, (_, i) => ({
    start: from + i * size,
    end: from + (i + 1) * size,
    counts: { ok: 0, fallback: 0, failed: 0, pending: 0 },
    total: 0,
  }));
  for (const item of items) {
    const t = Date.parse(item.createdAt);
    if (!Number.isFinite(t) || t > now || t < from) continue;
    const bucket = result[Math.min(buckets - 1, Math.floor((t - from) / size))]!;
    bucket.counts[outcomeOf(item)] += 1;
    bucket.total += 1;
  }
  return result;
}
