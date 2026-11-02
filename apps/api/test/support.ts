import {
  InMemoryAuditLogRepository,
  InMemoryDispatchCapacityRepository,
  InMemoryProviderRepository,
  InMemorySubscriptionRepository,
  CreateSubscription,
  ListAuditLog,
  ListProviders,
  ListSubscriptions,
  SetSubscriptionActive,
  UpdateProvider,
} from '@notifyhub/application';

/** Dependencias de proveedores y bitácora para las pruebas que no las usan a fondo. */
export function providerAndAuditDeps(
  providerRepository = new InMemoryProviderRepository(),
  auditRepository = new InMemoryAuditLogRepository(),
  capacity = new InMemoryDispatchCapacityRepository(),
  subscriptionRepository = new InMemorySubscriptionRepository(),
) {
  return {
    providers: new ListProviders(providerRepository),
    updateProvider: new UpdateProvider(providerRepository),
    audit: new ListAuditLog(auditRepository),
    capacity,
    subscriptions: {
      list: new ListSubscriptions(subscriptionRepository),
      create: new CreateSubscription(subscriptionRepository),
      setActive: new SetSubscriptionActive(subscriptionRepository),
    },
  };
}
