import type { ClientApp, ClientAppRepository } from '@notifyhub/application';
import type { ClientBase } from 'pg';

export class PgClientAppRepository implements ClientAppRepository {
  constructor(private readonly db: ClientBase) {}

  async findByApiKeyHash(apiKeyHash: string): Promise<ClientApp | null> {
    const { rows } = await this.db.query<{
      id: string;
      name: string;
      rate_limit_per_min: number;
      active: boolean;
    }>(`SELECT id, name, rate_limit_per_min, active FROM client_app WHERE api_key_hash = $1`, [apiKeyHash]);
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, name: row.name, rateLimitPerMin: row.rate_limit_per_min, active: row.active };
  }
}
