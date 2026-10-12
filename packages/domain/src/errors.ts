export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(from: string, to: string) {
    super(`No se puede pasar de ${from} a ${to}`);
  }
}

export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(key: string) {
    super(`La Idempotency-Key "${key}" ya se usó con una solicitud distinta`);
  }
}

export class NotificationNotFoundError extends DomainError {
  readonly code = 'NOTIFICATION_NOT_FOUND';

  constructor(id: string) {
    super(`No existe la notificación ${id}`);
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';

  constructor() {
    super('El cursor de paginación no es válido; pide la primera página otra vez');
  }
}

export class ProviderNotRegisteredError extends DomainError {
  readonly code = 'PROVIDER_NOT_REGISTERED';

  constructor(providerCode: string) {
    super(`No hay un SenderCreator registrado para el proveedor "${providerCode}"`);
  }
}
