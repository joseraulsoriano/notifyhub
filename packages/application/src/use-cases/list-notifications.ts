import type { NotificationListFilter, NotificationListItem, NotificationRepository } from '../ports';
import { decodeCursor, encodeCursor } from '../cursor';

export interface ListNotificationsInput {
  clientAppId: string;
  filter: NotificationListFilter;
  limit: number;
  cursor?: string | undefined;
}

export interface ListNotificationsOutput {
  items: NotificationListItem[];
  nextCursor: string | null;
}

/** Lista paginada para la consola. Cada cliente solo ve sus notificaciones. */
export class ListNotifications {
  constructor(private readonly repository: NotificationRepository) {}

  async execute({
    clientAppId,
    filter,
    limit,
    cursor,
  }: ListNotificationsInput): Promise<ListNotificationsOutput> {
    const page = await this.repository.list(clientAppId, filter, {
      limit,
      ...(cursor ? { cursor: decodeCursor(cursor) } : {}),
    });
    return { items: page.items, nextCursor: page.next ? encodeCursor(page.next) : null };
  }
}
