import type { Channel, Provider } from '@notifyhub/client';
import { CHANNEL_LABEL } from './labels';
import type { ChannelFlow, Transfer } from './route';
import { CHANNEL_VAR } from './status';

const COLS = { received: 190, queue: 400, provider: 640, delivered: 900 };
const ROW = (i: number) => 64 + i * 80;
const fmt = (n: number) => n.toLocaleString('en-US');

export interface RouteMapProps {
  flows: readonly ChannelFlow[];
  providers: readonly Provider[];
  transfers: readonly Transfer[];
}

/**
 * Mapa de rutas: cada canal es una línea; las estaciones son recibidas, cola, proveedor y entregadas; los
 * transbordos naranjas muestran el tráfico que cambió de canal por fallback.
 */
export function RouteMap({ flows, providers, transfers }: RouteMapProps) {
  const rowOf = (c: Channel) => flows.findIndex((f) => f.channel === c);
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 1000 330"
        className="min-w-[760px]"
        role="img"
        aria-label="Mapa de rutas por canal con transbordos de fallback"
      >
        <g className="fill-ink-3 text-[11px] font-semibold uppercase tracking-wider" textAnchor="middle">
          <text x={COLS.received} y="18">
            Recibidas
          </text>
          <text x={COLS.queue} y="18">
            En cola
          </text>
          <text x={COLS.provider} y="18">
            Proveedor
          </text>
          <text x={COLS.delivered} y="18">
            Entregadas
          </text>
        </g>
        {flows.map((flow, i) => {
          const y = ROW(i);
          const color = CHANNEL_VAR[flow.channel];
          const provider = providers.find((p) => p.channel === flow.channel);
          const unhealthy = provider ? provider.health !== 'UP' || !provider.enabled : false;
          const providerLabel = provider
            ? `${provider.code}${!provider.enabled ? ' · deshabilitado' : provider.health === 'DOWN' ? ' · caído' : provider.health === 'DEGRADED' ? ' · degradado' : ''}`
            : '—';
          return (
            <g key={flow.channel}>
              <text x="0" y={y + 5} className="fill-foreground text-[13px] font-semibold">
                {CHANNEL_LABEL[flow.channel]}
              </text>
              <path
                d={`M${COLS.received} ${y} H${COLS.delivered}`}
                stroke={color}
                strokeWidth="7"
                strokeLinecap="round"
                fill="none"
              />
              {Object.values(COLS).map((x) => (
                <circle key={x} cx={x} cy={y} r="9" className="fill-card" stroke={color} strokeWidth="5" />
              ))}
              <g className="fill-muted-foreground font-mono text-[12px]" textAnchor="middle">
                <text x={COLS.received} y={y - 16}>
                  {fmt(flow.received)}
                </text>
                <text x={COLS.queue} y={y - 16}>
                  {fmt(flow.received)}
                </text>
                <text x={COLS.provider} y={y - 16} className={unhealthy ? 'fill-transfer-ink' : ''}>
                  {providerLabel}
                </text>
                <text x={COLS.delivered} y={y - 16}>
                  {fmt(flow.delivered)}
                </text>
              </g>
            </g>
          );
        })}
        {transfers.map((t) => {
          const from = rowOf(t.from);
          const to = rowOf(t.to);
          if (from < 0 || to < 0) return null;
          const y1 = ROW(from);
          const y2 = ROW(to);
          const x1 = COLS.provider + 130;
          const x2 = COLS.delivered - 70;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={`${t.from}-${t.to}`}>
              <path
                d={`M${x1} ${y1} C${x1 + 45} ${y1} ${x2 - 45} ${y2} ${x2} ${y2}`}
                stroke="var(--transfer)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="0.1 11"
                fill="none"
              />
              <rect
                x={mx - 7}
                y={my - 7}
                width="14"
                height="14"
                rx="2.5"
                transform={`rotate(45 ${mx} ${my})`}
                fill="var(--transfer)"
              />
              <text x={mx + 16} y={my + 4} className="fill-transfer-ink text-[12px] font-semibold">
                {t.count} pasan de {CHANNEL_LABEL[t.from]} a {CHANNEL_LABEL[t.to]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
