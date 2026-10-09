import type { ClientApp } from '@notifyhub/application';
import type { Request } from 'express';

export interface ClientRequest extends Request {
  clientApp: ClientApp;
}
