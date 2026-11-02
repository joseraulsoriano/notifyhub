import type { CreateSubscriptionInput, NotificationSubscription, SubscriptionRepository } from '../ports';

export class ListSubscriptions {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  execute(clientAppId: string): Promise<NotificationSubscription[]> {
    return this.subscriptions.list(clientAppId);
  }
}

export class CreateSubscription {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  execute(input: CreateSubscriptionInput): Promise<NotificationSubscription> {
    return this.subscriptions.create(input);
  }
}

export class SetSubscriptionActive {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  execute(clientAppId: string, id: string, active: boolean) {
    return this.subscriptions.setActive(clientAppId, id, active);
  }
}
