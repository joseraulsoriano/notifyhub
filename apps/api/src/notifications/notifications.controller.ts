import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { NotificationDetail } from '@notifyhub/application';
import { AcceptNotification, GetNotificationStatus } from '@notifyhub/application';
import type { NotificationRequest } from '@notifyhub/domain';
import type { Response } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import type { ClientRequest } from '../auth/client-request';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { CreateNotificationSchema, IdempotencyKeySchema, NotificationIdSchema } from './schemas';

function summary(n: NotificationRequest) {
  return {
    id: n.id,
    status: n.status,
    priority: n.priority,
    preferredChannel: n.preferredChannel,
    createdAt: n.createdAt.toISOString(),
    links: { self: `/v1/notifications/${n.id}` },
  };
}

function detail({ notification, attempts, history }: NotificationDetail) {
  return {
    ...summary(notification),
    updatedAt: notification.updatedAt.toISOString(),
    attempts: attempts.map((a) => ({
      attemptNumber: a.attemptNumber,
      provider: a.providerCode,
      channel: a.channel,
      status: a.status,
      isFallback: a.isFallback,
      providerMessageId: a.providerMessageId,
      errorCode: a.errorCode,
      latencyMs: a.latencyMs,
      attemptedAt: a.attemptedAt.toISOString(),
    })),
    history: history.map((h) => ({ from: h.from, to: h.to, at: h.occurredAt.toISOString() })),
  };
}

@Controller('v1/notifications')
@UseGuards(ApiKeyGuard, RateLimitGuard)
export class NotificationsController {
  constructor(
    @Inject(AcceptNotification) private readonly accept: AcceptNotification,
    @Inject(GetNotificationStatus) private readonly getStatus: GetNotificationStatus,
  ) {}

  /** RF1 (NH-14, NH-15, NH-16): valida, persiste, encola y responde 202 sin esperar el envío. */
  @Post()
  @HttpCode(202)
  async create(
    @Req() req: ClientRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const idempotencyKey = IdempotencyKeySchema.parse(rawKey);
    const payload = CreateNotificationSchema.parse(body);

    const { notification, replayed } = await this.accept.execute({
      clientAppId: req.clientApp.id,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...payload,
    });

    res.setHeader('Location', `/v1/notifications/${notification.id}`);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return summary(notification);
  }

  /** NH-18: estado actual e historial de intentos. */
  @Get(':id')
  async findOne(@Req() req: ClientRequest, @Param('id') rawId: string) {
    const id = NotificationIdSchema.parse(rawId);
    return detail(await this.getStatus.execute(id, req.clientApp.id));
  }
}
