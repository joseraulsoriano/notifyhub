import type { NotificationQueue } from '@notifyhub/application';
import type { Priority } from '@notifyhub/domain';
import type { DispatchJobData } from '@notifyhub/shared';

/** NH-16: una cola de Cloudflare Queues por prioridad. */
export class QueuesNotificationQueue implements NotificationQueue {
  constructor(private readonly queues: Record<Priority, Queue<DispatchJobData>>) {}

  async enqueue(notificationId: string, priority: Priority) {
    await this.queues[priority].send({ notificationId }, { contentType: 'json' });
  }
}
