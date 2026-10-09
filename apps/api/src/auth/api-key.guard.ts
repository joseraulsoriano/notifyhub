import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ClientAppRepository } from '@notifyhub/application';
import { hashApiKey } from '@notifyhub/application';
import { CLIENT_APP_REPOSITORY } from '../tokens';
import type { ClientRequest } from './client-request';

/** NH-17: el cliente se identifica con X-API-Key; en la base solo se guarda el hash SHA-256. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(CLIENT_APP_REPOSITORY) private readonly clients: ClientAppRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ClientRequest>();
    const apiKey = req.header('x-api-key');
    if (!apiKey) throw new UnauthorizedException('Falta el encabezado X-API-Key');

    const client = await this.clients.findByApiKeyHash(hashApiKey(apiKey));
    if (!client || !client.active) throw new UnauthorizedException('API key inválida o revocada');

    req.clientApp = client;
    return true;
  }
}
