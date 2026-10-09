import type { ClientAppRepository } from '@notifyhub/application';
import type { PrismaClient } from '../generated/client';

export class PrismaClientAppRepository implements ClientAppRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByApiKeyHash(apiKeyHash: string) {
    const row = await this.prisma.clientApp.findUnique({ where: { apiKeyHash } });
    return row && { id: row.id, name: row.name, rateLimitPerMin: row.rateLimitPerMin, active: row.active };
  }
}
