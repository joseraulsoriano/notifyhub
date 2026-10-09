import { hashApiKey } from '@notifyhub/application';
import { PrismaClient } from '../generated/client';

/** Datos locales: un cliente de desarrollo y el catálogo de proveedores de config/routing.yaml. */
async function main() {
  const prisma = new PrismaClient();
  const apiKey = process.env.DEV_API_KEY ?? 'nh_dev_local_key';

  await prisma.clientApp.upsert({
    where: { apiKeyHash: hashApiKey(apiKey) },
    update: {},
    create: { name: 'App de desarrollo', apiKeyHash: hashApiKey(apiKey), rateLimitPerMin: 600 },
  });

  const providers = [
    { code: 'sendgrid', channel: 'EMAIL', costPerMessage: 0.0008, reliabilityScore: 95 },
    { code: 'twilio', channel: 'SMS', costPerMessage: 0.0079, reliabilityScore: 97 },
    { code: 'fcm', channel: 'PUSH', costPerMessage: 0, reliabilityScore: 92 },
    { code: 'webhook', channel: 'WEBHOOK', costPerMessage: 0, reliabilityScore: 90 },
  ] as const;
  for (const p of providers) {
    await prisma.provider.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  console.log(`Seed listo. API key de desarrollo: ${apiKey}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
