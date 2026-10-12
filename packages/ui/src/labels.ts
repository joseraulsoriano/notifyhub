import type { Channel, NotificationStatus, Priority, ProviderHealth } from '@notifyhub/client';

export const STATUS_LABEL: Record<NotificationStatus, string> = {
  RECEIVED: 'Recibida',
  QUEUED: 'En cola',
  SENDING: 'Enviando',
  SENT: 'Enviada',
  DELIVERED: 'Entregada',
  RETRYING: 'Reintentando',
  FALLBACK: 'Fallback',
  FAILED: 'Fallida',
};

export const HEALTH_LABEL: Record<ProviderHealth, string> = {
  UP: 'Operativo',
  DEGRADED: 'Degradado',
  DOWN: 'Caído',
};
export const PRIORITY_LABEL: Record<Priority, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };
export const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  PUSH: 'Push',
  WEBHOOK: 'Webhook',
};

/** Estados que piden atención del operador. */
export const NEEDS_ATTENTION: readonly NotificationStatus[] = ['FAILED', 'RETRYING'];

/** "ahora", "hace 5 min", "hace 3 h", "ayer" o la fecha corta. `now` se inyecta para pruebas. */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 60 * 24) return `hace ${Math.floor(minutes / 60)} h`;
  if (minutes < 60 * 48) return 'ayer';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/** Encabezado de agrupación por día: "Hoy", "Ayer" o la fecha. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}
