export interface WebhookEvent {
  id: string;
  [key: string]: unknown;
}

export interface WebhookDestination {
  subscriptionId: string;
  targetUrl: string;
  secretHash: string;
  event: WebhookEvent;
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('El hash del secreto de webhook no es válido');
  return Uint8Array.from(value.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

function toHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signWebhookPayload(secretHash: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(secretHash),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `sha256=${toHex(signature)}`;
}

export async function postWebhook(
  destination: WebhookDestination,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const body = JSON.stringify(destination.event);
  const signature = await signWebhookPayload(destination.secretHash, body);
  return fetcher(destination.targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
      'X-NotifyHub-Event-Id': destination.event.id,
      'X-NotifyHub-Subscription-Id': destination.subscriptionId,
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
}
