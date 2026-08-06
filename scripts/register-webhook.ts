/**
 * Регистрация webhook в Avito Messenger API.
 * Запуск: npx tsx scripts/register-webhook.ts https://<домен>
 * Требует env: AVITO_CLIENT_ID, AVITO_CLIENT_SECRET, AVITO_WEBHOOK_SECRET.
 */
import { subscribeWebhook } from '../lib/avito/client';
import { config } from '../lib/config';

async function main() {
  const base = process.argv[2];
  if (!base) {
    console.error('Использование: npx tsx scripts/register-webhook.ts https://<домен>');
    process.exit(1);
  }
  if (!config.avito.webhookSecret) {
    console.error('AVITO_WEBHOOK_SECRET не задан');
    process.exit(1);
  }
  const url = `${base.replace(/\/$/, '')}/api/avito/webhook/${config.avito.webhookSecret}`;
  await subscribeWebhook(url);
  console.log('Webhook зарегистрирован:', url);
}

main().catch((e) => {
  console.error('Ошибка регистрации webhook:', e);
  process.exit(1);
});
