// Sin emitDecoratorMetadata, cada dependencia se inyecta por token explícito.
export const NOTIFICATION_REPOSITORY = Symbol('NotificationRepository');
export const NOTIFICATION_QUEUE = Symbol('NotificationQueue');
export const CLIENT_APP_REPOSITORY = Symbol('ClientAppRepository');
export const RATE_LIMITER = Symbol('RateLimiter');
export const CLOCK = Symbol('Clock');
export const ID_GENERATOR = Symbol('IdGenerator');
export const APP_CONFIG = Symbol('AppConfig');
