import { InvalidCursorError } from '@notifyhub/domain';
import type { ListCursor } from './ports';

const SHAPE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9a-f-]{36})$/i;

/** Cursor opaco para el cliente: base64url de "fecha|id". */
export function encodeCursor(cursor: ListCursor): string {
  return btoa(`${cursor.createdAt.toISOString()}|${cursor.id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function decodeCursor(value: string): ListCursor {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const match = SHAPE.exec(atob(padded));
    const createdAt = match ? new Date(match[1]!) : null;
    if (!match || !createdAt || Number.isNaN(createdAt.getTime())) throw new Error('forma inválida');
    return { createdAt, id: match[2]! };
  } catch {
    throw new InvalidCursorError();
  }
}
