import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@notifyhub/shared';
import { AppModule } from './app.module';
import { createInfrastructure } from './infra/infrastructure';

async function bootstrap() {
  const config = loadConfig();
  const infrastructure = createInfrastructure(config);
  const app = await NestFactory.create(AppModule.register(infrastructure.providers), {
    logger: config.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const shutdown = async () => {
    await app.close();
    await infrastructure.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await app.listen(config.PORT);
  Logger.log(`NotifyHub API escuchando en http://localhost:${config.PORT}`, 'Bootstrap');
}

void bootstrap();
