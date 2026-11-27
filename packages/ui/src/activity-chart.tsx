import type { NotificationListItem } from '@notifyhub/client';
import { useMemo } from 'react';
import { bucketize, OUTCOMES, type Outcome } from './activity';
import { cn } from './lib/cn';

const COLOR: Record<Outcome, string> = {
  ok: 'bg-success',
  fallback: 'bg-transfer',
  failed: 'bg-destructive',
  pending: 'bg-running/60',
};
const LABEL: Record<Outcome, string> = {
  ok: 'Entregadas',
  fallback: 'Por respaldo',
  failed: 'Fallidas',
  pending: 'En curso',
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

export interface ActivityChartProps {
  items: readonly NotificationListItem[];
  /** Alto de la zona de barras en píxeles. */
  height?: number;
  /** Oculta ejes y leyenda: para la franja pequeña sobre una lista. */
  compact?: boolean;
  now?: number;
  className?: string;
}

/**
 * Histograma de actividad: barras apiladas por resultado (entregada, por respaldo, fallida, en curso). Es el
 * resumen visual que va antes de la tabla; cada barra tiene su detalle como texto accesible.
 */
export function ActivityChart({ items, height = 96, compact, now, className }: ActivityChartProps) {
  const buckets = useMemo(() => bucketize(items, now ?? Date.now()), [items, now]);
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const summary = OUTCOMES.map((o) => `${buckets.reduce((s, b) => s + b.counts[o], 0)} ${LABEL[o].toLowerCase()}`).join(', ');

  return (
    <figure className={cn('w-full', className)}>
      <div
        role="img"
        aria-label={`Actividad: ${total} notificaciones (${summary}) entre ${clock(buckets[0]!.start)} y ${clock(buckets.at(-1)!.end)}`}
        className="flex items-end gap-[3px]"
        style={{ height }}
      >
        {buckets.map((b) => (
          <div
            key={b.start}
            title={`${clock(b.start)} · ${b.total} notificaciones`}
            className="flex h-full flex-1 flex-col justify-end"
          >
            {b.total === 0 ? (
              <div className="h-px w-full bg-border" />
            ) : (
              <div className="flex flex-col-reverse overflow-hidden rounded-[2px]" style={{ height: `${(b.total / peak) * 100}%` }}>
                {OUTCOMES.map(
                  (o) => b.counts[o] > 0 && <div key={o} className={COLOR[o]} style={{ flexGrow: b.counts[o] }} />,
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!compact && (
        <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-mono tabular-nums">
            {clock(buckets[0]!.start)} → {clock(buckets.at(-1)!.end)}
          </span>
          <span className="flex flex-wrap gap-x-3">
            {OUTCOMES.map((o) => (
              <span key={o} className="inline-flex items-center gap-1.5">
                <span className={cn('size-2 rounded-[2px]', COLOR[o])} aria-hidden /> {LABEL[o]}
              </span>
            ))}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
