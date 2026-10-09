import { IdempotencyConflictError } from '@notifyhub/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryNotificationQueue,
  InMemoryNotificationRepository,
  SequentialIds,
} from '../testing/in-memory';
import type { AcceptNotificationInput } from './accept-notification';
import { AcceptNotification, IDEMPOTENCY_WINDOW_MS } from './accept-notification';

const input: AcceptNotificationInput = {
  clientAppId: 'app-1',
  sender: { name: 'Banco Demo', email: 'alertas@banco.demo' },
  recipient: { email: 'ana@example.com' },
  message: { subject: 'Cargo detectado', body: 'Se hizo un cargo de $1,200 a tu tarjeta.' },
  priority: 'HIGH',
  preferredChannel: 'EMAIL',
};

describe('AcceptNotification', () => {
  let repository: InMemoryNotificationRepository;
  let queue: InMemoryNotificationQueue;
  let clock: FixedClock;
  let useCase: AcceptNotification;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    queue = new InMemoryNotificationQueue();
    clock = new FixedClock();
    useCase = new AcceptNotification(repository, queue, clock, new SequentialIds());
  });

  it('persiste la solicitud, la encola con su prioridad y la deja en QUEUED', async () => {
    const { notification, replayed } = await useCase.execute(input);

    expect(replayed).toBe(false);
    expect(notification.status).toBe('QUEUED');
    expect(queue.jobs).toEqual([{ notificationId: notification.id, priority: 'HIGH' }]);
    expect(repository.history.get(notification.id)?.map((h) => h.to)).toEqual(['RECEIVED', 'QUEUED']);
  });

  it('con la misma Idempotency-Key y el mismo contenido devuelve la solicitud original sin reencolar', async () => {
    const first = await useCase.execute({ ...input, idempotencyKey: 'k-1' });
    const second = await useCase.execute({ ...input, idempotencyKey: 'k-1' });

    expect(second.replayed).toBe(true);
    expect(second.notification.id).toBe(first.notification.id);
    expect(queue.jobs).toHaveLength(1);
  });

  it('rechaza la misma Idempotency-Key con contenido distinto', async () => {
    await useCase.execute({ ...input, idempotencyKey: 'k-1' });

    await expect(
      useCase.execute({ ...input, idempotencyKey: 'k-1', message: { body: 'otro texto' } }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('después de 24 h la llave se puede reutilizar', async () => {
    const first = await useCase.execute({ ...input, idempotencyKey: 'k-1' });
    clock.advance(IDEMPOTENCY_WINDOW_MS + 1);
    const second = await useCase.execute({ ...input, idempotencyKey: 'k-1' });

    expect(second.replayed).toBe(false);
    expect(second.notification.id).not.toBe(first.notification.id);
    expect(queue.jobs).toHaveLength(2);
  });

  it('si la cola falla, la solicitud queda persistida en RECEIVED para recuperarla', async () => {
    queue.failNext = true;
    const { notification } = await useCase.execute(input);

    expect(notification.status).toBe('RECEIVED');
    expect(repository.items.get(notification.id)?.status).toBe('RECEIVED');
  });

  it('el orden de las llaves no cambia el hash de idempotencia', async () => {
    await useCase.execute({ ...input, idempotencyKey: 'k-2' });
    const reordered = { ...input, message: { body: input.message.body, subject: input.message.subject } };

    await expect(useCase.execute({ ...reordered, idempotencyKey: 'k-2' })).resolves.toMatchObject({
      replayed: true,
    });
  });
});
