export type SubscriptionEventType = 'notification.status_changed' | 'notification.attempted';

export interface NotificationSubscription {
  id: string;
  subscriberName: string;
  targetUrl: string;
  eventTypes: SubscriptionEventType[];
  active: boolean;
}

export interface CreateSubscriptionInput {
  id: string;
  clientAppId: string;
  subscriberName: string;
  targetUrl: string;
  eventTypes: SubscriptionEventType[];
  secretHash: string;
}

export interface SubscriptionRepository {
  list(clientAppId: string): Promise<NotificationSubscription[]>;
  create(input: CreateSubscriptionInput): Promise<NotificationSubscription>;
  setActive(clientAppId: string, id: string, active: boolean): Promise<NotificationSubscription | null>;
}
