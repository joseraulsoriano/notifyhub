import type { NotificationListItem } from '@notifyhub/client';
import { ArrowLeftRight, Repeat2 } from 'lucide-react';
import { cn } from './lib/cn';
import { formatAgo, NEEDS_ATTENTION } from './labels';
import { ChannelTag, PriorityBadge, StationDot, StatusBadge } from './status';

export interface NotificationItemProps {
  item: NotificationListItem;
  selected?: boolean;
  /** Sin vista previa ni destinatario: para listas pequeñas como "actividad reciente". */
  compact?: boolean;
  onSelect?: (item: NotificationListItem) => void;
  /** Para pruebas: la hora de referencia de "hace 5 min". */
  now?: Date;
}

const SETTLED = ['DELIVERED', 'SENT'];

/**
 * Fila de una notificación: estación de estado, asunto, canal como línea de metro y, si hubo fallback, el
 * transbordo entre canales. El estado se escribe con texto cuando no es "entregada".
 */
export function NotificationItem({ item, selected, compact, onSelect, now }: NotificationItemProps) {
  const attention = NEEDS_ATTENTION.includes(item.status);
  const transferred =
    item.usedFallback && item.finalChannel !== null && item.finalChannel !== item.preferredChannel;
  const title = item.subject ?? item.preview;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(item);
        }
      }}
      className={cn(
        'grid cursor-pointer grid-cols-[14px_1fr_auto] gap-3.5 border-b px-4 py-3 outline-none transition-colors last:border-b-0',
        'hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-secondary hover:bg-secondary',
      )}
    >
      <StationDot status={transferred && item.status === 'DELIVERED' ? 'FALLBACK' : item.status} />
      <div className="min-w-0">
        <p className={cn('truncate text-sm', attention ? 'font-bold' : 'font-semibold')}>{title}</p>
        {!compact && item.subject && (
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{item.preview}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <ChannelTag channel={item.preferredChannel} />
          {transferred && item.finalChannel && (
            <>
              <ArrowLeftRight className="size-3.5 text-transfer" strokeWidth={2.5} aria-label="transbordo" />
              <ChannelTag channel={item.finalChannel} />
            </>
          )}
          {!SETTLED.includes(item.status) && <StatusBadge status={item.status} />}
          {item.priority === 'HIGH' && <PriorityBadge priority={item.priority} />}
          {item.attemptCount > 1 && (
            <span className="inline-flex items-center gap-1">
              <Repeat2 className="size-3.5" aria-hidden />
              {item.attemptCount} intentos
            </span>
          )}
          {!compact && <span className="font-mono">{item.recipient}</span>}
        </div>
      </div>
      <div className="text-right text-xs text-ink-3">
        {formatAgo(item.createdAt, now)}
        {item.attemptCount > 0 && (
          <span className="mt-1.5 block font-mono tabular-nums text-muted-foreground">
            {item.totalLatencyMs.toLocaleString('en-US')} ms
          </span>
        )}
      </div>
    </div>
  );
}
