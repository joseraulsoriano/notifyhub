import {
  ATTEMPT_STATUSES,
  CHANNELS,
  NOTIFICATION_STATUSES,
  PRIORITIES,
  PROVIDER_HEALTHS,
  RECIPIENT_FIELD_BY_CHANNEL,
} from '@notifyhub/domain';
import { z } from 'zod';

/** Acepta "alta", "media", "baja" además de HIGH, MEDIUM, LOW (RF1 está redactado en español). */
const PRIORITY_ALIASES: Record<string, (typeof PRIORITIES)[number]> = {
  alta: 'HIGH',
  media: 'MEDIUM',
  baja: 'LOW',
};

const Priority = z.preprocess(
  (v) => (typeof v === 'string' ? (PRIORITY_ALIASES[v.toLowerCase()] ?? v.toUpperCase()) : v),
  z.enum(PRIORITIES),
);
const Channel = z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(CHANNELS));

const E164 = /^\+[1-9]\d{7,14}$/;

export const CreateNotificationSchema = z
  .object({
    sender: z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().email().optional(),
      phone: z.string().regex(E164, 'debe estar en formato E.164, por ejemplo +5212221234567').optional(),
    }),
    recipient: z
      .object({
        email: z.string().email().optional(),
        phone: z.string().regex(E164, 'debe estar en formato E.164, por ejemplo +5212221234567').optional(),
        deviceToken: z.string().min(10).max(4096).optional(),
        webhookUrl: z.string().url().startsWith('https://', 'el webhook debe usar https').optional(),
      })
      .refine((r) => Object.values(r).some(Boolean), 'se requiere al menos un dato de contacto'),
    message: z.object({
      subject: z.string().max(200).optional(),
      body: z.string().trim().min(1).max(10_000),
      data: z.record(z.string()).optional(),
    }),
    priority: Priority,
    preferredChannel: Channel,
  })
  .strict()
  .superRefine((value, ctx) => {
    const field = RECIPIENT_FIELD_BY_CHANNEL[value.preferredChannel];
    if (!value.recipient[field]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipient', field],
        message: `el canal ${value.preferredChannel} requiere recipient.${field}`,
      });
    }
  });

export type CreateNotificationBody = z.infer<typeof CreateNotificationSchema>;

export const IdempotencyKeySchema = z
  .string()
  .min(8, 'la Idempotency-Key debe tener entre 8 y 255 caracteres')
  .max(255, 'la Idempotency-Key debe tener entre 8 y 255 caracteres')
  .optional();

export const NotificationIdSchema = z.string().uuid();

/** GET /v1/notifications: filtros opcionales y paginación por cursor. */
export const ListNotificationsQuerySchema = z.object({
  status: z
    .preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(NOTIFICATION_STATUSES))
    .optional(),
  channel: Channel.optional(),
  priority: Priority.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(200).optional(),
});

/** GET /v1/audit-log */
export const ListAuditLogQuerySchema = z.object({
  notificationId: z.string().uuid().optional(),
  eventType: z.string().min(1).max(60).optional(),
  channel: Channel.optional(),
  provider: z.string().min(1).max(40).optional(),
  status: z
    .preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(ATTEMPT_STATUSES))
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(200).optional(),
});

/** PATCH /v1/providers/{code}: al menos un campo. */
export const UpdateProviderSchema = z
  .object({
    health: z
      .preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(PROVIDER_HEALTHS))
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.health !== undefined || v.enabled !== undefined, 'indica health o enabled');

export const ProviderCodeSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/, 'código de proveedor inválido');
