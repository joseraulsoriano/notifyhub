import type { Channel, NotificationDetail, NotificationListItem } from '@notifyhub/client';
import { CHANNEL_LABEL, PRIORITY_LABEL } from './labels';

export type RouteLegKind =
  'start' | 'info' | 'attempt-ok' | 'attempt-fail' | 'attempt-retry' | 'transfer' | 'end-fail';

/** Un paso de la ruta del mensaje, con el tiempo transcurrido desde que se recibió. */
export interface RouteLeg {
  kind: RouteLegKind;
  label: string;
  detail?: string;
  /** Milisegundos desde la recepción. */
  at: number;
  /** Canal en el que ocurre el paso: define el color del riel. */
  channel?: Channel;
  /** Código de respuesta del proveedor o id del mensaje. */
  code?: string;
}

type Event =
  | { t: number; source: 'status'; to: string; from: string | null }
  | { t: number; source: 'attempt'; attempt: NotificationDetail['attempts'][number] };

/**
 * Reconstruye la ruta del mensaje desde el historial de estados y los intentos que devuelve la API:
 * cada intento es una estación y el paso a FALLBACK es un transbordo hacia el siguiente canal.
 */
export function buildRoute(detail: NotificationDetail): RouteLeg[] {
  const created = new Date(detail.createdAt).getTime();
  const events: Event[] = [
    ...detail.history.map((h): Event => ({
      t: new Date(h.at).getTime(),
      source: 'status',
      to: h.to,
      from: h.from,
    })),
    ...detail.attempts.map((attempt): Event => ({
      t: new Date(attempt.attemptedAt).getTime(),
      source: 'attempt',
      attempt,
    })),
  ].sort((a, b) => a.t - b.t || (a.source === 'attempt' ? -1 : 1));

  const legs: RouteLeg[] = [];
  let channel: Channel = detail.preferredChannel;

  events.forEach((event, index) => {
    const at = Math.max(0, event.t - created);
    if (event.source === 'attempt') {
      const a = event.attempt;
      channel = a.channel;
      legs.push({
        kind: a.status === 'SENT' ? 'attempt-ok' : a.status === 'FAILED' ? 'attempt-fail' : 'attempt-retry',
        label: `Intento ${a.attemptNumber} · ${a.provider}`,
        detail: `${CHANNEL_LABEL[a.channel]} · ${a.status === 'SENT' ? 'entregada al proveedor' : a.status === 'RETRYING' ? 'reintentando' : 'falló'}${a.latencyMs ? ` · ${a.latencyMs} ms` : ''}`,
        at,
        channel: a.channel,
        ...((a.errorCode ?? a.providerMessageId)
          ? { code: (a.errorCode ?? a.providerMessageId) as string }
          : {}),
      });
      return;
    }
    switch (event.to) {
      case 'RECEIVED':
        legs.push({
          kind: 'start',
          label: 'Solicitud recibida',
          detail: 'POST /v1/notifications · 202 Accepted',
          at,
        });
        break;
      case 'QUEUED':
        legs.push({
          kind: 'info',
          label: 'Encolada',
          detail: `Cola de prioridad ${PRIORITY_LABEL[detail.priority].toLowerCase()}`,
          at,
          channel,
        });
        break;
      case 'SENDING':
        if (event.from === 'QUEUED') legs.push({ kind: 'info', label: 'Un worker la tomó', at, channel });
        break;
      case 'FALLBACK': {
        const next = events
          .slice(index + 1)
          .find((e) => e.source === 'attempt' && e.attempt.channel !== channel);
        const nextChannel = next?.source === 'attempt' ? next.attempt.channel : null;
        legs.push({
          kind: 'transfer',
          label: nextChannel ? `Transbordo a ${CHANNEL_LABEL[nextChannel]}` : 'Sin más canales',
          detail: `${CHANNEL_LABEL[channel]} agotó sus reintentos`,
          at,
        });
        break;
      }
      case 'DELIVERED':
        legs.push({
          kind: 'info',
          label: 'Confirmación de entrega',
          detail: 'Confirmada por el proveedor',
          at,
          channel,
        });
        break;
      case 'FAILED':
        legs.push({
          kind: 'end-fail',
          label: 'Sin alternativas',
          detail: 'Notificación marcada como fallida',
          at,
        });
        break;
      default:
        // RETRYING, SENT: ya los cuentan los intentos.
        break;
    }
  });
  return legs;
}

export interface ChannelFlow {
  channel: Channel;
  received: number;
  delivered: number;
}
export interface Transfer {
  from: Channel;
  to: Channel;
  count: number;
}

const CHANNELS: Channel[] = ['EMAIL', 'SMS', 'PUSH', 'WEBHOOK'];
const DONE = ['DELIVERED', 'SENT'];

/** Recibidas por canal preferido, entregadas por canal final y transbordos entre canales. */
export function computeFlows(items: readonly NotificationListItem[]): {
  flows: ChannelFlow[];
  transfers: Transfer[];
} {
  const flows = CHANNELS.map((channel) => ({
    channel,
    received: items.filter((i) => i.preferredChannel === channel).length,
    delivered: items.filter(
      (i) => DONE.includes(i.status) && (i.finalChannel ?? i.preferredChannel) === channel,
    ).length,
  }));
  const counts = new Map<string, Transfer>();
  for (const i of items) {
    if (
      !DONE.includes(i.status) ||
      !i.usedFallback ||
      !i.finalChannel ||
      i.finalChannel === i.preferredChannel
    )
      continue;
    const key = `${i.preferredChannel}>${i.finalChannel}`;
    const current = counts.get(key);
    counts.set(key, { from: i.preferredChannel, to: i.finalChannel, count: (current?.count ?? 0) + 1 });
  }
  return { flows, transfers: [...counts.values()] };
}

export interface Summary {
  total: number;
  delivered: number;
  failed: number;
  /** % entregadas sobre las que ya terminaron (entregadas + fallidas). */
  deliveryRate: number | null;
  /** % de notificaciones que usaron fallback. */
  fallbackRate: number | null;
  /** Percentil 95 del tiempo total de entrega, en ms. */
  p95LatencyMs: number | null;
}

export function summarize(items: readonly NotificationListItem[]): Summary {
  const delivered = items.filter((i) => DONE.includes(i.status)).length;
  const failed = items.filter((i) => i.status === 'FAILED').length;
  const finished = delivered + failed;
  const latencies = items
    .filter((i) => i.attemptCount > 0 && DONE.includes(i.status))
    .map((i) => i.totalLatencyMs)
    .sort((a, b) => a - b);
  return {
    total: items.length,
    delivered,
    failed,
    deliveryRate: finished ? Math.round((delivered / finished) * 1000) / 10 : null,
    fallbackRate: items.length
      ? Math.round((items.filter((i) => i.usedFallback).length / items.length) * 1000) / 10
      : null,
    p95LatencyMs: latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]!
      : null,
  };
}
