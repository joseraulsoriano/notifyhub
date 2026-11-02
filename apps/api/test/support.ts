import {
  InMemoryAuditLogRepository,
  InMemoryDispatchCapacityRepository,
  InMemoryProviderRepository,
  ListAuditLog,
  ListProviders,
  UpdateProvider,
} from '@notifyhub/application';

/** Dependencias de proveedores y bitácora para las pruebas que no las usan a fondo. */
export function providerAndAuditDeps(
  providerRepository = new InMemoryProviderRepository(),
  auditRepository = new InMemoryAuditLogRepository(),
  capacity = new InMemoryDispatchCapacityRepository(),
) {
  return {
    providers: new ListProviders(providerRepository),
    updateProvider: new UpdateProvider(providerRepository),
    audit: new ListAuditLog(auditRepository),
    capacity,
  };
}
