import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '../src/index';

const secretHash = createHash('sha256').update('nhs_test_secret').digest('hex');
const body = JSON.stringify({ id: 'event-1', type: 'notification.status_changed' });
const signature = `sha256=${createHmac('sha256', Buffer.from(secretHash, 'hex')).update(body).digest('hex')}`;

describe('webhook inbox signature verification', () => {
  it('accepts a signature made with the stored secret hash and exact request body', async () => {
    await expect(verifyWebhookSignature(secretHash, body, signature)).resolves.toBe(true);
  });

  it('rejects altered bodies and malformed signatures', async () => {
    await expect(verifyWebhookSignature(secretHash, `${body} `, signature)).resolves.toBe(false);
    await expect(verifyWebhookSignature(secretHash, body, 'invalid')).resolves.toBe(false);
    await expect(verifyWebhookSignature('invalid', body, signature)).resolves.toBe(false);
  });
});
