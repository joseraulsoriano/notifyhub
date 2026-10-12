import { decodeCursor, encodeCursor, NUMERIC_ID } from '../cursor';
import type { AuditEntry, AuditLogFilter, AuditLogRepository } from '../ports';

export interface ListAuditLogInput {
  clientAppId: string;
  filter: AuditLogFilter;
  limit: number;
  cursor?: string | undefined;
}

export interface ListAuditLogOutput {
  items: AuditEntry[];
  nextCursor: string | null;
}

/** RF4: consulta de la bitácora de auditoría de un cliente, con filtros y paginación por cursor. */
export class ListAuditLog {
  constructor(private readonly repository: AuditLogRepository) {}

  async execute({ clientAppId, filter, limit, cursor }: ListAuditLogInput): Promise<ListAuditLogOutput> {
    const page = await this.repository.list(clientAppId, filter, {
      limit,
      ...(cursor ? { cursor: decodeCursor(cursor, NUMERIC_ID) } : {}),
    });
    return { items: page.items, nextCursor: page.next ? encodeCursor(page.next) : null };
  }
}
