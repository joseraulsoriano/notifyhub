import type { NotificationRequest, Priority, Provider } from '@notifyhub/domain';

/** Strategy (NH-26): ordena los proveedores candidatos de un canal. El primero se intenta primero. */
export interface ProviderSelectionStrategy {
  readonly name: string;
  rank(request: NotificationRequest, candidates: readonly Provider[]): Provider[];
}

const HEALTH_ORDER = { UP: 0, DEGRADED: 1, DOWN: 2 } as const;

/** El más barato primero; a igual costo, el más confiable. Para prioridad baja. */
export class CostStrategy implements ProviderSelectionStrategy {
  readonly name = 'cost';

  rank(_request: NotificationRequest, candidates: readonly Provider[]) {
    return [...candidates].sort(
      (a, b) => a.costPerMessage - b.costPerMessage || b.reliabilityScore - a.reliabilityScore,
    );
  }
}

/** Sigue un orden configurado (reglas de ruteo); los no listados van al final, en su orden original. */
export class PriorityStrategy implements ProviderSelectionStrategy {
  readonly name = 'priority';

  constructor(private readonly order: readonly string[] = []) {}

  rank(_request: NotificationRequest, candidates: readonly Provider[]) {
    const position = (p: Provider) => {
      const index = this.order.indexOf(p.code);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...candidates].sort((a, b) => position(a) - position(b));
  }
}

/** El que está en mejor salud primero (UP, luego DEGRADED, luego DOWN); a igual salud, el más confiable. */
export class AvailabilityStrategy implements ProviderSelectionStrategy {
  readonly name = 'availability';

  rank(_request: NotificationRequest, candidates: readonly Provider[]) {
    return [...candidates].sort(
      (a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || b.reliabilityScore - a.reliabilityScore,
    );
  }
}

export type StrategyName = 'cost' | 'priority' | 'availability';

/** Estrategia por prioridad según config/routing.yaml: alta favorece disponibilidad, baja favorece costo. */
export function strategyFor(
  name: StrategyName,
  priorityOrder: readonly string[] = [],
): ProviderSelectionStrategy {
  switch (name) {
    case 'cost':
      return new CostStrategy();
    case 'priority':
      return new PriorityStrategy(priorityOrder);
    case 'availability':
      return new AvailabilityStrategy();
  }
}

export type StrategyByPriority = (priority: Priority) => ProviderSelectionStrategy;
