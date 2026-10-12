import {
  DomainError,
  IdempotencyConflictError,
  InvalidCursorError,
  NotificationNotFoundError,
} from '@notifyhub/domain';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

export interface Problem {
  type: string;
  title: string;
  status: ContentfulStatusCode;
  detail?: string;
  errors?: { path: string; message: string }[];
}

const DOMAIN_STATUS: [new (...args: never[]) => DomainError, ContentfulStatusCode][] = [
  [NotificationNotFoundError, 404],
  [IdempotencyConflictError, 409],
  [InvalidCursorError, 400],
];

const STATUS_TITLE: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  429: 'TOO_MANY_REQUESTS',
};

export function httpProblem(status: ContentfulStatusCode, detail: string): Problem {
  return {
    type: `https://notifyhub.dev/problems/http-${status}`,
    title: STATUS_TITLE[status] ?? 'Error',
    status,
    detail,
  };
}

/** Todos los errores salen como application/problem+json (RFC 9457), igual que en docs/api/openapi.yaml. */
export function toProblem(error: unknown): Problem {
  if (error instanceof ZodError) {
    return {
      type: 'https://notifyhub.dev/problems/validation',
      title: 'Solicitud inválida',
      status: 400,
      errors: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  if (error instanceof DomainError) {
    return {
      type: `https://notifyhub.dev/problems/${error.code.toLowerCase().replaceAll('_', '-')}`,
      title: error.name,
      status: DOMAIN_STATUS.find(([cls]) => error instanceof cls)?.[1] ?? 422,
      detail: error.message,
    };
  }
  if (error instanceof HTTPException) {
    return httpProblem(error.status as ContentfulStatusCode, error.message);
  }
  console.error(error);
  return { type: 'about:blank', title: 'Error interno', status: 500 };
}
