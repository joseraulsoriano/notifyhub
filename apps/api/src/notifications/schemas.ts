import { CHANNELS, PRIORITIES, RECIPIENT_FIELD_BY_CHANNEL } from '@notifyhub/domain';
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
