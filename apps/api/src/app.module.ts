import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { Clock, IdGenerator, NotificationQueue, NotificationRepository } from '@notifyhub/application';
import { AcceptNotification, GetNotificationStatus } from '@notifyhub/application';
import { ApiKeyGuard } from './auth/api-key.guard';
import { RateLimitGuard } from './auth/rate-limit.guard';
import { ProblemFilter } from './common/problem.filter';
import { HealthController } from './health.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { CLOCK, ID_GENERATOR, NOTIFICATION_QUEUE, NOTIFICATION_REPOSITORY } from './tokens';

/**
 * Los casos de uso no conocen NestJS: aquí se conectan con sus adaptadores.
 * `infrastructure` trae los adaptadores reales (Prisma, Redis, BullMQ) o los de memoria en las pruebas.
 */
@Module({})
export class AppModule {
  static register(infrastructure: Provider[]): DynamicModule {
    return {
      module: AppModule,
      controllers: [NotificationsController, HealthController],
      providers: [
        ...infrastructure,
        ApiKeyGuard,
        RateLimitGuard,
        { provide: APP_FILTER, useClass: ProblemFilter },
        {
          provide: AcceptNotification,
          inject: [NOTIFICATION_REPOSITORY, NOTIFICATION_QUEUE, CLOCK, ID_GENERATOR],
          useFactory: (
            repo: NotificationRepository,
            queue: NotificationQueue,
            clock: Clock,
            ids: IdGenerator,
          ) => new AcceptNotification(repo, queue, clock, ids),
        },
        {
          provide: GetNotificationStatus,
          inject: [NOTIFICATION_REPOSITORY],
          useFactory: (repo: NotificationRepository) => new GetNotificationStatus(repo),
        },
      ],
    };
  }
}
