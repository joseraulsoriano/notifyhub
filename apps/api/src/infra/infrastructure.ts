import type { Provider } from '@nestjs/common';
import {
  PrismaClient,
  PrismaClientAppRepository,
  PrismaNotificationRepository,
} from '@notifyhub/persistence';
import type { AppConfig } from '@notifyhub/shared';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import {
  APP_CONFIG,
  CLIENT_APP_REPOSITORY,
  CLOCK,
  ID_GENERATOR,
  NOTIFICATION_QUEUE,
  NOTIFICATION_REPOSITORY,
  RATE_LIMITER,
} from '../tokens';
import { BullMqNotificationQueue } from './bullmq-notification-queue';
import { RedisRateLimiter } from './redis-rate-limiter';

export interface Infrastructure {
  providers: Provider[];
  close(): Promise<void>;
}

export function createInfrastructure(config: AppConfig): Infrastructure {
  const prisma = new PrismaClient();
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new BullMqNotificationQueue(redis);

  return {
    providers: [
      { provide: APP_CONFIG, useValue: config },
      { provide: NOTIFICATION_REPOSITORY, useValue: new PrismaNotificationRepository(prisma) },
      { provide: CLIENT_APP_REPOSITORY, useValue: new PrismaClientAppRepository(prisma) },
      { provide: NOTIFICATION_QUEUE, useValue: queue },
      { provide: RATE_LIMITER, useValue: new RedisRateLimiter(redis) },
      { provide: CLOCK, useValue: { now: () => new Date() } },
      { provide: ID_GENERATOR, useValue: { next: () => randomUUID() } },
    ],
    async close() {
      await queue.close();
      redis.disconnect();
      await prisma.$disconnect();
    },
  };
}
