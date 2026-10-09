import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { RateLimiter } from '@notifyhub/application';
import type { AppConfig } from '@notifyhub/shared';
import type { Response } from 'express';
import { APP_CONFIG, RATE_LIMITER } from '../tokens';
import type { ClientRequest } from './client-request';

/** NH-17: límite por cliente (client_app.rate_limit_per_min). Va después de ApiKeyGuard. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'RATE_LIMIT_WINDOW_SECONDS'>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<ClientRequest>();
    const res = http.getResponse<Response>();

    const window = this.config.RATE_LIMIT_WINDOW_SECONDS;
    const result = await this.limiter.hit(`rl:${req.clientApp.id}`, req.clientApp.rateLimitPerMin, window);
    res.setHeader('RateLimit-Limit', result.limit);
    res.setHeader('RateLimit-Remaining', result.remaining);
    res.setHeader('RateLimit-Reset', result.resetSeconds);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.resetSeconds);
      throw new HttpException('Límite de solicitudes excedido', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
