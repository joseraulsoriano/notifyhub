/**
 * El relevo es público, así que solo reenvía lo mínimo y con límites: temas `taskflow-…`, título y mensaje cortos,
 * etiquetas conocidas y NUNCA enlaces (`click`), para que no sirva de buzón de spam o phishing hacia otros temas.
 */
export const TOPIC = /^taskflow-[A-Za-z0-9_-]{4,56}$/;
const TAG = /^[a-z0-9_]{1,30}$/;
const MAX_BODY_BYTES = 2048;

export type Push = { topic: string; title: string; message: string; tags?: string[] };

export function sanitize(input: unknown): Push | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const { topic, title, message, tags } = raw;
  if (typeof topic !== 'string' || !TOPIC.test(topic)) return null;
  if (typeof title !== 'string' || title.length === 0 || title.length > 120) return null;
  if (typeof message !== 'string' || message.length === 0 || message.length > 300) return null;
  let cleanTags: string[] | undefined;
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > 3 || !tags.every((t) => typeof t === 'string' && TAG.test(t)))
      return null;
    cleanTags = tags as string[];
  }
  return { topic, title, message, ...(cleanTags ? { tags: cleanTags } : {}) };
}

export const withinLimit = (bytes: number) => bytes <= MAX_BODY_BYTES;
