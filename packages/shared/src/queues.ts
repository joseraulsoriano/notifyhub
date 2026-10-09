import type { Priority } from '@notifyhub/domain';

/** Una cola por prioridad (NH-16). El despachador consume primero la de prioridad alta. */
export const QUEUE_BY_PRIORITY: Record<Priority, string> = {
  HIGH: 'notifications-high',
  MEDIUM: 'notifications-medium',
  LOW: 'notifications-low',
};

export const DISPATCH_JOB = 'dispatch';

export interface DispatchJobData {
  notificationId: string;
}
