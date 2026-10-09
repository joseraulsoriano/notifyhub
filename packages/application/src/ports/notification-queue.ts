import type { Priority } from '@notifyhub/domain';

export interface NotificationQueue {
  enqueue(notificationId: string, priority: Priority): Promise<void>;
}
