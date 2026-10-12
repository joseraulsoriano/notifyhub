/** Error de la API (RFC 9457 `application/problem+json`) o de red. */
export class NotifyHubError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  /** Errores de validación campo por campo, si la API los envió. */
  readonly errors: { path: string; message: string }[] | undefined;
  /** Segundos de espera sugeridos cuando el límite de solicitudes se excedió (429). */
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    status: number;
    title: string;
    detail?: string | undefined;
    errors?: { path: string; message: string }[] | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    super(init.detail ?? init.title);
    this.name = 'NotifyHubError';
    this.status = init.status;
    this.title = init.title;
    this.detail = init.detail;
    this.errors = init.errors;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}
