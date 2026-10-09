import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FixedClock,
  hashApiKey,
  InMemoryClientAppRepository,
  InMemoryNotificationQueue,
  InMemoryNotificationRepository,
  InMemoryRateLimiter,
  SequentialIds,
} from '@notifyhub/application';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  APP_CONFIG,
  CLIENT_APP_REPOSITORY,
  CLOCK,
  ID_GENERATOR,
  NOTIFICATION_QUEUE,
  NOTIFICATION_REPOSITORY,
  RATE_LIMITER,
} from '../src/tokens';

const API_KEY = 'nh_test_key_123';
const OTHER_KEY = 'nh_other_key_456';

const validBody = {
  sender: { name: 'Banco Demo', email: 'alertas@banco.demo' },
  recipient: { email: 'ana@example.com', phone: '+5212221234567' },
  message: { subject: 'Cargo detectado', body: 'Se hizo un cargo de $1,200 a tu tarjeta.' },
  priority: 'alta',
  preferredChannel: 'email',
};

describe('API /v1/notifications', () => {
  let app: INestApplication;
  let queue: InMemoryNotificationQueue;

  beforeEach(async () => {
    queue = new InMemoryNotificationQueue();
    const clients = new InMemoryClientAppRepository();
    clients.add(hashApiKey(API_KEY), { id: 'app-1', name: 'Pruebas', rateLimitPerMin: 5, active: true });
    clients.add(hashApiKey(OTHER_KEY), { id: 'app-2', name: 'Otra app', rateLimitPerMin: 5, active: true });

    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register([
          { provide: APP_CONFIG, useValue: { RATE_LIMIT_WINDOW_SECONDS: 60 } },
          { provide: NOTIFICATION_REPOSITORY, useValue: new InMemoryNotificationRepository() },
          { provide: NOTIFICATION_QUEUE, useValue: queue },
          { provide: CLIENT_APP_REPOSITORY, useValue: clients },
          { provide: RATE_LIMITER, useValue: new InMemoryRateLimiter() },
          { provide: CLOCK, useValue: new FixedClock() },
          { provide: ID_GENERATOR, useValue: new SequentialIds() },
        ]),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: unknown = validBody, key = API_KEY) =>
    request(app.getHttpServer())
      .post('/v1/notifications')
      .set('X-API-Key', key)
      .send(body as object);

  it('responde 202 con id y la encola en la cola de su prioridad', async () => {
    const res = await post();

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'QUEUED', priority: 'HIGH', preferredChannel: 'EMAIL' });
    expect(res.headers.location).toBe(`/v1/notifications/${res.body.id}`);
    expect(queue.jobs).toEqual([{ notificationId: res.body.id, priority: 'HIGH' }]);
  });

  it('responde 401 sin API key o con una inválida', async () => {
    const missing = await request(app.getHttpServer()).post('/v1/notifications').send(validBody);
    const wrong = await post(validBody, 'nh_no_existe');

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.headers['content-type']).toContain('application/problem+json');
  });

  it('responde 400 con el detalle de cada campo inválido', async () => {
    const res = await post({ ...validBody, priority: 'urgente', recipient: { phone: '2221234567' } });

    expect(res.status).toBe(400);
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['priority', 'recipient.phone']));
  });

  it('exige el dato de contacto del canal preferente', async () => {
    const res = await post({ ...validBody, preferredChannel: 'PUSH' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { path: 'recipient.deviceToken', message: 'el canal PUSH requiere recipient.deviceToken' },
    ]);
  });

  it('rechaza campos desconocidos', async () => {
    const res = await post({ ...validBody, provider: 'twilio' });
    expect(res.status).toBe(400);
  });

  it('con la misma Idempotency-Key no genera un segundo envío', async () => {
    const first = await post().set('Idempotency-Key', 'pedido-0001');
    const second = await post().set('Idempotency-Key', 'pedido-0001');

    expect(second.status).toBe(202);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(queue.jobs).toHaveLength(1);
  });

  it('responde 409 si la Idempotency-Key se reutiliza con otro contenido', async () => {
    await post().set('Idempotency-Key', 'pedido-0002');
    const res = await post({ ...validBody, message: { body: 'otro' } }).set('Idempotency-Key', 'pedido-0002');

    expect(res.status).toBe(409);
  });

  it('responde 429 al pasar el límite del cliente e informa los encabezados RateLimit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post()).status);
    const last = await post();

    expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(statuses[5]).toBe(429);
    expect(last.headers['retry-after']).toBeDefined();
    expect(last.headers['ratelimit-remaining']).toBe('0');
  });

  it('GET devuelve el estado y el historial, solo al cliente dueño', async () => {
    const { body: created } = await post();

    const own = await request(app.getHttpServer()).get(created.links.self).set('X-API-Key', API_KEY);
    const other = await request(app.getHttpServer()).get(created.links.self).set('X-API-Key', OTHER_KEY);

    expect(own.status).toBe(200);
    expect(own.body.status).toBe('QUEUED');
    expect(own.body.attempts).toEqual([]);
    expect(own.body.history.map((h: { to: string }) => h.to)).toEqual(['RECEIVED', 'QUEUED']);
    expect(other.status).toBe(404);
  });

  it('GET con un id que no es UUID responde 400', async () => {
    const res = await request(app.getHttpServer()).get('/v1/notifications/abc').set('X-API-Key', API_KEY);
    expect(res.status).toBe(400);
  });

  it('/health no pide API key', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
