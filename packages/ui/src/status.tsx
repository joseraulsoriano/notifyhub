import type { Channel, NotificationStatus, Priority, ProviderHealth } from '@notifyhub/client';
import {
  ArrowLeftRight,
  Check,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  RotateCw,
  Smartphone,
  Webhook,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './lib/cn';
import { CHANNEL_LABEL, PRIORITY_LABEL, STATUS_LABEL } from './labels';

type Tone = 'success' | 'error' | 'running' | 'warn' | 'transfer' | 'neutral';

const TONE: Record<Tone, string> = {
  success: 'text-success border-success/30 bg-success/10',
  error: 'text-destructive border-destructive/30 bg-destructive/10',
  running: 'text-running border-running/30 bg-running/10',
  warn: 'text-[#8A6500] border-line-push/50 bg-line-push/15',
  transfer: 'text-transfer-ink border-transfer/40 bg-transfer/10',
  neutral: 'text-muted-foreground border-border bg-card',
};

const STATUS_META: Record<
  NotificationStatus | ProviderHealth,
  { tone: Tone; icon: typeof Check; spin?: boolean }
> = {
  DELIVERED: { tone: 'success', icon: Check },
  SENT: { tone: 'success', icon: Check },
  UP: { tone: 'success', icon: Check },
  QUEUED: { tone: 'neutral', icon: Clock },
  RECEIVED: { tone: 'neutral', icon: Clock },
  SENDING: { tone: 'running', icon: Loader2, spin: true },
  RETRYING: { tone: 'warn', icon: RotateCw },
  DEGRADED: { tone: 'warn', icon: RotateCw },
  FALLBACK: { tone: 'transfer', icon: ArrowLeftRight },
  FAILED: { tone: 'error', icon: X },
  DOWN: { tone: 'error', icon: X },
};

/** Estado con icono y texto: nunca solo color (DESIGN.md). */
export function StatusBadge({
  status,
  label,
}: {
  status: NotificationStatus | ProviderHealth;
  label?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-semibold',
        TONE[meta.tone],
      )}
    >
      <meta.icon className={cn('size-3', meta.spin && 'animate-spin')} strokeWidth={2.5} aria-hidden />
      {label ?? STATUS_LABEL[status as NotificationStatus] ?? status}
    </span>
  );
}

/** Estado como estación de la línea: entregada, fallida, en cola, enviando, reintentando o fallback. */
export function StationDot({ status, className }: { status: NotificationStatus; className?: string }) {
  const base = 'mt-1 inline-block size-3.5 shrink-0';
  const label = STATUS_LABEL[status];
  switch (status) {
    case 'DELIVERED':
    case 'SENT':
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(base, 'grid place-items-center rounded-full bg-success text-white', className)}
        >
          <Check className="size-2.5" strokeWidth={4} aria-hidden />
        </span>
      );
    case 'FAILED':
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(base, 'grid place-items-center rounded-full bg-destructive text-white', className)}
        >
          <X className="size-2.5" strokeWidth={4} aria-hidden />
        </span>
      );
    case 'FALLBACK':
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(base, 'rotate-45 rounded-[3px] bg-transfer', className)}
        />
      );
    case 'SENDING':
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(
            base,
            'animate-spin rounded-full border-[3px] border-running border-r-transparent',
            className,
          )}
        />
      );
    case 'RETRYING':
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(base, 'rounded-full border-[3px] border-dashed border-line-push', className)}
        />
      );
    default:
      return (
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(base, 'rounded-full border-[3px] border-ink-3 bg-card', className)}
        />
      );
  }
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        'rounded-sm border px-1.5 py-0.5 text-xs font-semibold',
        priority === 'HIGH' ? TONE.error : priority === 'MEDIUM' ? TONE.warn : TONE.neutral,
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export const CHANNEL_ICON: Record<Channel, typeof Mail> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  PUSH: Smartphone,
  WEBHOOK: Webhook,
};
export const CHANNEL_BG: Record<Channel, string> = {
  EMAIL: 'bg-line-email',
  SMS: 'bg-line-sms',
  PUSH: 'bg-line-push',
  WEBHOOK: 'bg-line-webhook',
};
export const CHANNEL_VAR: Record<Channel, string> = {
  EMAIL: 'var(--line-email)',
  SMS: 'var(--line-sms)',
  PUSH: 'var(--line-push)',
  WEBHOOK: 'var(--line-webhook)',
};

/** Canal como trazo de línea de metro y su nombre. */
export function ChannelTag({ channel, className }: { channel: Channel; className?: string }): ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <i className={cn('inline-block h-1 w-4 rounded-full', CHANNEL_BG[channel])} aria-hidden />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}
