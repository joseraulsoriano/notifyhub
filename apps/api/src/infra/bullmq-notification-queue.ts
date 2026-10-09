import type { NotificationQueue } from '@notifyhub/application';
import type { Priority } from '@notifyhub/domain';
import type { DispatchJobData } from '@notifyhub/shared';
import { DISPATCH_JOB, QUEUE_BY_PRIORITY } from '@notifyhub/shared';
import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/** NH-16: una cola de BullMQ por prioridad. El jobId es el id de la notificación para no duplicar trabajos. */
export class BullMqNotificationQueue implements NotificationQueue {
  private readonly queues: Record<Priority, Queue<DispatchJobData>>;

  constructor(connection: ConnectionOptions) {
    const make = (name: string) =>
      new Queue<DispatchJobData>(name, {
        connection,
        defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 5_000 },
      });
    this.queues = {
      HIGH: make(QUEUE_BY_PRIORITY.HIGH),
      MEDIUM: make(QUEUE_BY_PRIORITY.MEDIUM),
      LOW: make(QUEUE_BY_PRIORITY.LOW),
    };
  }

  async enqueue(notificationId: string, priority: Priority) {
    await this.queues[priority].add(DISPATCH_JOB, { notificationId }, { jobId: notificationId });
  }

  async close() {
    await Promise.all(Object.values(this.queues).map((q) => q.close()));
  }
}
