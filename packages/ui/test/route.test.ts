import { describe, expect, it } from 'vitest';
import { buildRoute, computeFlows, summarize } from '../src/route';
import { fallbackDetail, item } from './fixtures';

describe('buildRoute', () => {
  const legs = buildRoute(fallbackDetail);

  it('cuenta la historia completa: intentos, transbordo y entrega', () => {
    expect(legs.map((l) => l.label)).toEqual([
      'Solicitud recibida',
      'Encolada',
      'Un worker la tomó',
      'Intento 1 · fcm',
      'Intento 2 · fcm',
      'Intento 3 · fcm',
      'Transbordo a SMS',
      'Intento 4 · twilio',
      'Confirmación de entrega',
    ]);
    expect(legs.map((l) => l.kind)).toEqual([
      'start',
      'info',
      'info',
      'attempt-retry',
      'attempt-retry',
      'attempt-fail',
      'transfer',
      'attempt-ok',
      'info',
    ]);
  });

  it('los tiempos salen del servidor, en milisegundos desde la recepción', () => {
    expect(legs[0]!.at).toBe(0);
    expect(legs[3]!.at).toBe(2200);
    expect(legs.find((l) => l.kind === 'transfer')!.at).toBe(6400);
    expect(legs.at(-1)!.at).toBe(7010);
  });

  it('el color del canal cambia tras el transbordo', () => {
    expect(legs.filter((l) => l.kind.startsWith('attempt')).map((l) => l.channel)).toEqual([
      'PUSH',
      'PUSH',
      'PUSH',
      'SMS',
    ]);
    expect(legs.at(-1)!.channel).toBe('SMS');
  });

  it('muestra el código de error y el id del mensaje', () => {
    expect(legs[3]!.code).toBe('503 UNAVAILABLE');
    expect(legs.find((l) => l.kind === 'attempt-ok')!.code).toBe('SMabc123');
  });

  it('una notificación fallida termina en "Sin alternativas"', () => {
    const failed = buildRoute({
      ...fallbackDetail,
      status: 'FAILED',
      attempts: fallbackDetail.attempts.slice(0, 3),
      history: [
        ...fallbackDetail.history.slice(0, 8),
        { from: 'FALLBACK', to: 'FAILED', at: '2026-10-12T15:00:06.500Z' },
      ],
    });
    expect(failed.at(-1)).toMatchObject({ kind: 'end-fail', label: 'Sin alternativas' });
    expect(failed.find((l) => l.kind === 'transfer')!.label).toBe('Sin más canales');
  });

  it('una notificación recién encolada solo tiene los primeros pasos', () => {
    const queued = buildRoute({
      ...fallbackDetail,
      status: 'QUEUED',
      attempts: [],
      history: fallbackDetail.history.slice(0, 2),
    });
    expect(queued.map((l) => l.label)).toEqual(['Solicitud recibida', 'Encolada']);
  });
});

describe('computeFlows y summarize', () => {
  const items = [
    item({ id: 'a', preferredChannel: 'EMAIL', finalChannel: 'EMAIL' }),
    item({ id: 'b', preferredChannel: 'EMAIL', finalChannel: 'EMAIL' }),
    item({
      id: 'c',
      preferredChannel: 'PUSH',
      finalChannel: 'SMS',
      usedFallback: true,
      attemptCount: 4,
      totalLatencyMs: 5967,
    }),
    item({ id: 'd', preferredChannel: 'SMS', status: 'FAILED', finalChannel: 'PUSH', usedFallback: true }),
    item({
      id: 'e',
      preferredChannel: 'WEBHOOK',
      status: 'QUEUED',
      attemptCount: 0,
      finalChannel: null,
      totalLatencyMs: 0,
    }),
  ];

  it('cuenta recibidas por canal preferido y entregadas por canal final', () => {
    const { flows } = computeFlows(items);
    const by = Object.fromEntries(flows.map((f) => [f.channel, [f.received, f.delivered]]));
    expect(by).toEqual({ EMAIL: [2, 2], SMS: [1, 1], PUSH: [1, 0], WEBHOOK: [1, 0] });
  });

  it('cuenta los transbordos solo de lo entregado', () => {
    expect(computeFlows(items).transfers).toEqual([{ from: 'PUSH', to: 'SMS', count: 1 }]);
  });

  it('resume tasa de entrega, fallback y p95', () => {
    expect(summarize(items)).toEqual({
      total: 5,
      delivered: 3,
      failed: 1,
      deliveryRate: 75,
      fallbackRate: 40,
      p95LatencyMs: 5967,
    });
  });

  it('con una lista vacía no inventa números', () => {
    expect(summarize([])).toEqual({
      total: 0,
      delivered: 0,
      failed: 0,
      deliveryRate: null,
      fallbackRate: null,
      p95LatencyMs: null,
    });
  });
});
