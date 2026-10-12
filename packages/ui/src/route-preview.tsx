import type { Channel } from '@notifyhub/client';
import { CHANNEL_LABEL } from './labels';
import { CHANNEL_VAR } from './status';

const DEFAULT_PROVIDER: Record<Channel, string> = {
  EMAIL: 'sendgrid',
  SMS: 'twilio',
  PUSH: 'fcm',
  WEBHOOK: 'webhook',
};

export interface RoutePreviewProps {
  /** Texto de la cola: "alta", "media" o "baja". */
  queue: string;
  channel: Channel;
  fallback: Channel;
  providers?: Partial<Record<Channel, string>>;
}

/** Ruta prevista de un envío: cola, canal preferido, transbordo y canal de respaldo. */
export function RoutePreview({ queue, channel, fallback, providers = {} }: RoutePreviewProps) {
  const a = CHANNEL_VAR[channel];
  const b = CHANNEL_VAR[fallback];
  const name = (c: Channel) => providers[c] ?? DEFAULT_PROVIDER[c];
  return (
    <svg
      viewBox="0 0 560 120"
      className="w-full"
      role="img"
      aria-label="Ruta prevista con transbordo de respaldo"
    >
      <path d="M50 44 H230" stroke={a} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path
        d="M230 44 C290 44 300 44 340 44"
        stroke="var(--transfer)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="0.1 11"
        fill="none"
      />
      <path d="M400 44 H520" stroke={b} strokeWidth="7" strokeLinecap="round" fill="none" />
      <rect
        x="313"
        y="37"
        width="14"
        height="14"
        rx="2.5"
        transform="rotate(45 320 44)"
        fill="var(--transfer)"
      />
      <g className="fill-card" strokeWidth="5">
        <circle cx="50" cy="44" r="9" stroke={a} />
        <circle cx="230" cy="44" r="9" stroke={a} />
        <circle cx="400" cy="44" r="9" stroke={b} />
        <circle cx="520" cy="44" r="9" stroke={b} />
      </g>
      <g textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
        <text x="50" y="78">
          Cola {queue}
        </text>
        <text x="230" y="78">
          {name(channel)}
        </text>
        <text x="400" y="78">
          {name(fallback)}
        </text>
        <text x="520" y="78">
          Entregada
        </text>
      </g>
      <g textAnchor="middle" className="fill-muted-foreground text-[11px]">
        <text x="230" y="95">
          {CHANNEL_LABEL[channel]}
        </text>
        <text x="400" y="95">
          {CHANNEL_LABEL[fallback]}
        </text>
      </g>
      <text x="320" y="24" textAnchor="middle" className="fill-transfer-ink text-[11px] font-semibold">
        si falla
      </text>
    </svg>
  );
}
