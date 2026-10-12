// Prisma solo define el esquema, las migraciones y el seed; en tiempo de ejecución se usa `pg` (ADR-007).
export * from './pg-client-app-repository';
export * from './pg-notification-repository';
export * from './pg-provider-repository';
export * from './pg-audit-log-repository';
