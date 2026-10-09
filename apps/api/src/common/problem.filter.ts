import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DomainError, IdempotencyConflictError, NotificationNotFoundError } from '@notifyhub/domain';
import type { Response } from 'express';
import { ZodError } from 'zod';

interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { path: string; message: string }[];
}

const DOMAIN_STATUS: [new (...args: never[]) => DomainError, number][] = [
  [NotificationNotFoundError, HttpStatus.NOT_FOUND],
  [IdempotencyConflictError, HttpStatus.CONFLICT],
];

/** Todos los errores salen como application/problem+json (RFC 9457), igual que en docs/api/openapi.yaml. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof ZodError) {
      return {
        type: 'https://notifyhub.dev/problems/validation',
        title: 'Solicitud inválida',
        status: HttpStatus.BAD_REQUEST,
        errors: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (exception instanceof DomainError) {
      const status =
        DOMAIN_STATUS.find(([cls]) => exception instanceof cls)?.[1] ?? HttpStatus.UNPROCESSABLE_ENTITY;
      return {
        type: `https://notifyhub.dev/problems/${exception.code.toLowerCase().replaceAll('_', '-')}`,
        title: exception.name,
        status,
        detail: exception.message,
      };
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const detail =
        typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      return {
        type: `https://notifyhub.dev/problems/http-${exception.getStatus()}`,
        title: HttpStatus[exception.getStatus()] ?? 'Error',
        status: exception.getStatus(),
        detail,
      };
    }
    this.logger.error(exception);
    return { type: 'about:blank', title: 'Error interno', status: HttpStatus.INTERNAL_SERVER_ERROR };
  }
}
