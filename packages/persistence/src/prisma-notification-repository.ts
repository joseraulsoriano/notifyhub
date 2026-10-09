import type { CreateResult, NotificationDetail, NotificationRepository } from '@notifyhub/application';
import type { DeliveryAttempt, NotificationRequest, NotificationStatus } from '@notifyhub/domain';
import { assertTransition } from '@notifyhub/domain';
import type { Notification as NotificationRow, PrismaClient } from '../generated/client';
import { Prisma } from '../generated/client';

function toDomain(row: NotificationRow): NotificationRequest {
  return {
    id: row.id,
    clientAppId: row.clientAppId,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    sender: row.sender as unknown as NotificationRequest['sender'],
    recipient: row.recipient as unknown as NotificationRequest['recipient'],
    message: row.message as unknown as NotificationRequest['message'],
    priority: row.priority,
    preferredChannel: row.preferredChannel,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toJson(value: object): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdempotencyKey(clientAppId: string, key: string) {
    const row = await this.prisma.notification.findUnique({
      where: { clientAppId_idempotencyKey: { clientAppId, idempotencyKey: key } },
    });
    return row ? toDomain(row) : null;
  }

  async createReceived(n: NotificationRequest): Promise<CreateResult> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.notification.create({
          data: {
            id: n.id,
            clientAppId: n.clientAppId,
            idempotencyKey: n.idempotencyKey,
            requestHash: n.requestHash,
            sender: toJson(n.sender),
            recipient: toJson(n.recipient),
            message: toJson(n.message),
            priority: n.priority,
            preferredChannel: n.preferredChannel,
            status: 'RECEIVED',
            createdAt: n.createdAt,
          },
        });
        await tx.auditLog.create({
          data: {
            notificationId: n.id,
            eventType: 'notification.received',
            toStatus: 'RECEIVED',
            channel: n.preferredChannel,
            occurredAt: n.createdAt,
          },
        });
        return created;
      });
      return { created: true, notification: toDomain(row) };
    } catch (error) {
      if (n.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(n.clientAppId, n.idempotencyKey);
        if (existing) return { created: false, existing };
      }
      throw error;
    }
  }

  async transition(id: string, from: NotificationStatus, to: NotificationStatus) {
    assertTransition(from, to);
    await this.prisma.$transaction(async (tx) => {
      // El filtro por estado de origen evita carreras entre la API y los workers.
      const { count } = await tx.notification.updateMany({
        where: { id, status: from },
        data: { status: to },
      });
      if (count === 0) throw new Error(`La notificación ${id} no está en ${from}`);
      await tx.auditLog.create({
        data: {
          notificationId: id,
          eventType: 'notification.status_changed',
          fromStatus: from,
          toStatus: to,
        },
      });
    });
  }

  async releaseIdempotencyKey(id: string) {
    await this.prisma.notification.update({ where: { id }, data: { idempotencyKey: null } });
  }

  async findDetail(id: string, clientAppId: string): Promise<NotificationDetail | null> {
    const row = await this.prisma.notification.findFirst({
      where: { id, clientAppId },
      include: {
        attempts: { include: { provider: true }, orderBy: { attemptNumber: 'asc' } },
        auditLog: { where: { eventType: { startsWith: 'notification.' } }, orderBy: { id: 'asc' } },
      },
    });
    if (!row) return null;

    const attempts: DeliveryAttempt[] = row.attempts.map((a) => ({
      id: a.id,
      notificationId: a.notificationId,
      providerCode: a.provider.code,
      channel: a.channel,
      attemptNumber: a.attemptNumber,
      isFallback: a.isFallback,
      status: a.status,
      providerMessageId: a.providerMessageId,
      errorCode: a.errorCode,
      latencyMs: a.latencyMs,
      attemptedAt: a.attemptedAt,
    }));
    const history = row.auditLog.map((e) => ({
      from: e.fromStatus,
      to: e.toStatus,
      occurredAt: e.occurredAt,
    }));
    return { notification: toDomain(row), attempts, history };
  }
}
