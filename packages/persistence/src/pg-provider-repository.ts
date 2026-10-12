import type { ProviderPatch, ProviderRepository } from '@notifyhub/application';
import type { Provider } from '@notifyhub/domain';
import type { ClientBase } from 'pg';

interface ProviderRow {
  code: string;
  channel: Provider['channel'];
  cost_per_message: string;
  reliability_score: number;
  health: Provider['health'];
  enabled: boolean;
}

const COLUMNS = 'code, channel, cost_per_message, reliability_score, health, enabled';

function toDomain(row: ProviderRow): Provider {
  return {
    code: row.code,
    channel: row.channel,
    // NUMERIC llega como texto desde pg.
    costPerMessage: Number(row.cost_per_message),
    reliabilityScore: row.reliability_score,
    health: row.health,
    enabled: row.enabled,
  };
}

/** Catálogo de proveedores sobre la tabla `provider` (sembrada con config/routing.yaml). */
export class PgProviderRepository implements ProviderRepository {
  constructor(private readonly db: ClientBase) {}

  async list(): Promise<Provider[]> {
    const { rows } = await this.db.query<ProviderRow>(`SELECT ${COLUMNS} FROM provider ORDER BY code`);
    return rows.map(toDomain);
  }

  async update(code: string, patch: ProviderPatch): Promise<Provider | null> {
    const { rows } = await this.db.query<ProviderRow>(
      `UPDATE provider SET health = COALESCE($2::"ProviderHealth", health), enabled = COALESCE($3, enabled)
       WHERE code = $1 RETURNING ${COLUMNS}`,
      [code, patch.health ?? null, patch.enabled ?? null],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
