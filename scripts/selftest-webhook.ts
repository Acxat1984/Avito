/** Самопроверка доставки вебхука: шлём сообщение от своего имени в тестовый чат,
 * ждём и проверяем, что вебхук зафиксировал событие (own_message → webhook_ignored). */
import { neon } from '@neondatabase/serverless';
import { sendMessage } from '../lib/avito/client';

const sql = neon(process.env.DATABASE_URL!);
const CHAT = 'u2i-zCVy5C0Co85LOeQdzTEcbA'; // чат тестового аккаунта по объявлению ООО
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await sendMessage(CHAT, 'Секунду, уточняю информацию.');
  console.log('служебное сообщение отправлено, жду вебхук до 90 сек...');
  for (let i = 0; i < 9; i++) {
    await sleep(10_000);
    const rows = await sql`
      select payload, created_at from bot_actions
      where action = 'webhook_ignored' and created_at > now() - interval '3 minutes'
      order by id desc limit 5
    `;
    if (rows.length) {
      console.log('ВЕБХУК ДОСТАВЛЯЕТ! события:', JSON.stringify(rows, null, 1));
      return;
    }
    console.log(`  ...${(i + 1) * 10} сек, событий нет`);
  }
  console.log('ВЕБХУК НЕ ДОСТАВИЛ событие за 90 секунд');
}

main().catch((e) => {
  console.error('ОШИБКА:', e instanceof Error ? e.message : e);
  process.exit(1);
});
