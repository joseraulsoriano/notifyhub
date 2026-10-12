import { InvalidCursorError } from '@notifyhub/domain';
import type { ListCursor } from './ports';

const UUID = /^[0-9a-f-]{36}$/i;
/** Los ids de la bitácora son enteros (bigint). */
export const NUMERIC_ID = /^\d{1,19}$/;

/** Cursor opaco para el cliente: base64url de "fecha|id". */
export function encodeCursor(cursor: ListCursor): string {
  return btoa(`${cursor.createdAt.toISOString()}|${cursor.id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function decodeCursor(value: string, idShape: RegExp = UUID): ListCursor {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const [date = '', id = ''] = atob(padded).split('|');
    const createdAt = new Date(date);
    if (
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(date) ||
      Number.isNaN(createdAt.getTime()) ||
      !idShape.test(id)
    ) {
      throw new Error('forma inválida');
    }
    return { createdAt, id };
  } catch {
    throw new InvalidCursorError();
  }
}
