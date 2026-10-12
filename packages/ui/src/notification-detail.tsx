import type { NotificationDetail as Detail, NotificationListItem } from '@notifyhub/client';
import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './lib/cn';
import { formatAgo } from './labels';
import { buildRoute, type RouteLeg } from './route';
import { CHANNEL_VAR, ChannelTag, PriorityBadge, StatusBadge } from './status';

export interface NotificationDetailProps {
  item: NotificationListItem;
  /** Intentos e historial (`client.notifications.get`). Sin esto solo se ven las propiedades de la lista. */
  detail?: Detail | null;
  loading?: boolean;
  /** Botones de acción (reenviar, abrir bitácora…). */
  actions?: ReactNode;
  onCopyId?: (id: string) => void;
  now?: Date;
}

const fmt = (ms: number) => (ms >= 1000 ? `+${(ms / 1000).toFixed(2)} s` : `+${ms} ms`);

function railColor(leg: RouteLeg): string {
  if (leg.kind === 'transfer') return 'var(--transfer)';
  if (leg.kind === 'start' || !leg.channel) return 'var(--ink-3)';
  return CHANNEL_VAR[leg.channel];
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 truncate">{children}</div>
    </div>
  );
}

function Station({ leg }: { leg: RouteLeg }) {
  if (leg.kind === 'transfer')
    return <span className="absolute left-[2px] top-1 size-3.5 rotate-45 rounded-[3px] bg-transfer" />;
  const color = leg.kind === 'end-fail' ? 'var(--destructive)' : railColor(leg);
  return (
    <span
      className="absolute left-[2px] top-1 size-3.5 rounded-full border-4 bg-card"
      style={{ borderColor: color, background: leg.kind === 'attempt-ok' ? color : undefined }}
    />
  );
}

/** Detalle de una notificación: propiedades y la ruta que siguió el mensaje, con el transbordo de fallback. */
export function NotificationDetail({
  item,
  detail,
  loading,
  actions,
  onCopyId,
  now,
}: NotificationDetailProps) {
  const route = detail ? buildRoute(detail) : [];
  const attempts = detail?.attempts ?? [];
  const finalAttempt = attempts.at(-1);
  const copy = () => {
    void navigator.clipboard?.writeText(item.id);
    onCopyId?.(item.id);
  };
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-bold leading-snug tracking-tight">
          {item.subject ?? item.preview}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            onClick={copy}
            aria-label="Copiar ID"
          >
            {item.id} <Copy className="size-3" aria-hidden />
          </button>
        </div>
      </div>

      <p className="rounded-md border bg-background px-3 py-2 text-[13px] text-muted-foreground">
        {item.preview}
      </p>

      <div>
        <Prop label="Destinatario">
          <span className="font-mono text-xs">{item.recipient}</span>
        </Prop>
        <Prop label="Canal preferido">
          <ChannelTag channel={item.preferredChannel} />
        </Prop>
        {finalAttempt && finalAttempt.channel !== item.preferredChannel && (
          <Prop label="Canal final">
            <ChannelTag channel={finalAttempt.channel} />
          </Prop>
        )}
        <Prop label="Prioridad">
          <PriorityBadge priority={item.priority} />
        </Prop>
        {item.idempotencyKey && (
          <Prop label="Idempotency-Key">
            <span className="font-mono text-xs">{item.idempotencyKey}</span>
          </Prop>
        )}
        <Prop label="Recibida">{formatAgo(item.createdAt, now)}</Prop>
        {item.attemptCount > 0 && (
          <Prop label="Tiempo total">
            <span className="font-mono text-xs">
              {item.totalLatencyMs.toLocaleString('en-US')} ms · {item.attemptCount}{' '}
              {item.attemptCount === 1 ? 'intento' : 'intentos'}
            </span>
          </Prop>
        )}
      </div>

      <div className="border-t pt-5">
        <h3 className="mb-4 font-heading text-[15px] font-bold">Ruta del mensaje</h3>
        {loading && !detail && <p className="text-xs text-muted-foreground">Cargando la ruta…</p>}
        <ol aria-label="Ruta del mensaje">
          {route.map((leg, i) => {
            const last = i === route.length - 1;
            return (
              <li key={`${leg.kind}-${i}`} className="relative grid grid-cols-[20px_1fr_auto] gap-3 pb-5">
                <div className="relative">
                  {!last && (
                    <span
                      className="absolute -bottom-5 left-[7px] top-4 w-[5px] rounded-full"
                      style={{
                        background:
                          leg.kind === 'transfer'
                            ? 'repeating-linear-gradient(to bottom, var(--transfer) 0 6px, transparent 6px 11px)'
                            : railColor(leg),
                      }}
                    />
                  )}
                  <Station leg={leg} />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-sm font-semibold', leg.kind === 'transfer' && 'text-transfer-ink')}>
                    {leg.label}
                  </p>
                  {leg.detail && <p className="text-xs text-muted-foreground">{leg.detail}</p>}
                  {leg.code && (
                    <code className="mt-1.5 block rounded-sm bg-primary px-2 py-1.5 font-mono text-xs text-primary-foreground">
                      {leg.code}
                    </code>
                  )}
                </div>
                <span className="font-mono text-xs tabular-nums text-ink-3">{fmt(leg.at)}</span>
              </li>
            );
          })}
        </ol>
        {detail && item.status === 'QUEUED' && (
          <p className="text-xs text-muted-foreground">Esperando a que un worker la tome de la cola.</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
