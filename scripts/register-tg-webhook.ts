/**
 * Регистрация вебхука Telegram-бота.
 * Запуск: env из .env.local, затем npx tsx scripts/register-tg-webhook.ts
 */
import { setWebhook } from '../lib/telegram/api';
import { config } from '../lib/config';

async function main() {
  const base = process.env.APP_URL;
  if (!base) throw new Error('APP_URL не задан');
  if (!config.telegram.webhookSecret) throw new Error('TELEGRAM_WEBHOOK_SECRET не задан');

  const url = `${base.replace(/\/$/, '')}/api/telegram/webhook`;
  const res = await setWebhook(url, config.telegram.webhookSecret);
  console.log('setWebhook:', JSON.stringify(res));
  console.log('URL:', url);
  console.log('Админы:', config.telegram.adminIds.join(', ') || '(не заданы!)');
  console.log('Доступ гостям:', config.telegram.guestAccess);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
