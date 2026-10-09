import { NotificationNotFoundError } from '@notifyhub/domain';
import type { NotificationDetail, NotificationRepository } from '../ports';

/** RF1/RF4: estado actual con su historial de intentos. Cada cliente solo ve sus notificaciones. */
export class GetNotificationStatus {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(id: string, clientAppId: string): Promise<NotificationDetail> {
    const detail = await this.repository.findDetail(id, clientAppId);
    if (!detail) throw new NotificationNotFoundError(id);
    return detail;
  }
}
