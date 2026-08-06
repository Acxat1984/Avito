/**
 * Прогон сценариев Telegram-бота без реальной отправки сообщений:
 * подменяем fetch к api.telegram.org и печатаем, что бот хотел отправить.
 * Запросы к DaData/OpenRouter идут по-настоящему.
 *
 * Запуск: env из .env.local, затем npx tsx scripts/test-bot.ts
 */
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const ADMIN = 756256883;
const GUEST = 999000111;

const sent: Array<{ chat: number; text: string }> = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('api.telegram.org')) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.text) sent.push({ chat: Number(body.chat_id), text: String(body.text) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

let updateId = 1;
function msg(chatId: number, text: string, isAdmin = false) {
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: 'private' },
      from: {
        id: chatId,
        username: isAdmin ? 'Acxat1984' : 'test_guest',
        first_name: isAdmin ? 'Асхат' : 'Гость',
      },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

async function scenario(title: string, update: unknown) {
  const { handleUpdate } = await import('../lib/telegram/bot');
  sent.length = 0;
  console.log(`\n${'='.repeat(70)}\n### ${title}\n${'='.repeat(70)}`);
  await handleUpdate(update as never);
  if (sent.length === 0) {
    console.log('  (бот ничего не ответил)');
    return;
  }
  for (const s of sent) {
    const who = s.chat === ADMIN ? 'админу' : s.chat === GUEST ? 'гостю' : `в чат ${s.chat}`;
    const preview = s.text.length > 700 ? s.text.slice(0, 700) + '\n  …' : s.text;
    console.log(`\n→ ${who}:\n${preview.split('\n').map((l) => '  ' + l).join('\n')}`);
  }
}

async function main() {
  // чистим тестового гостя, чтобы роль определялась заново
  await sql`delete from tg_users where chat_id = ${GUEST}`;

  await scenario('1. /start — админ', msg(ADMIN, '/start', true));
  await scenario('2. /start — новый пользователь', msg(GUEST, '/start'));
  await scenario('3. Регионы — гость', msg(GUEST, '🗺 Регионы'));
  await scenario('4. Регионы — админ', msg(ADMIN, '🗺 Регионы', true));
  await scenario('5. Все компании — гость (обезличенно)', msg(GUEST, '📋 Все компании'));
  await scenario('6. Поиск по региону «Казань» — гость', msg(GUEST, 'Казань'));
  await scenario('7. Карточка № 2 — гость', msg(GUEST, '2'));
  await scenario('8. Карточка № 2 — админ (полная)', msg(ADMIN, '№ 2', true));
  await scenario('9. Непонятный запрос — гость', msg(GUEST, 'а сколько стоит?'));
  await scenario('10. Меню добавления — админ', msg(ADMIN, '➕ Добавить', true));

  // добавление по ИНН (реальный запрос в DaData), потом удалим
  await scenario(
    '11. Быстрое добавление по ИНН — админ',
    msg(ADMIN, '7707083893 тел 89031234567 закуп 50 цена 200 альфа', true),
  );

  const [created] = await sql`select id from companies where inn = '7707083893'`;
  if (created) {
    await scenario(
      '12. Кнопка «В продажу» — админ',
      {
        update_id: updateId++,
        callback_query: {
          id: 'cb1',
          data: `verify:${created.id}`,
          from: { id: ADMIN, username: 'Acxat1984', first_name: 'Асхат' },
          message: { message_id: 1, chat: { id: ADMIN, type: 'private' }, date: 0 },
        },
      },
    );
    await scenario('13. Повторное добавление того же ИНН — дубль', msg(ADMIN, '7707083893', true));

    await sql`delete from company_audit where company_id = ${created.id}`;
    await sql`delete from companies where id = ${created.id}`;
    console.log(`\n[очистка] тестовая карточка № ${created.id} удалена`);
  }

  await scenario('14. Попытка добавить — гость (не должен)', msg(GUEST, '7707083893 цена 100'));
  await sql`delete from tg_users where chat_id = ${GUEST}`;
  console.log('\n[очистка] тестовый пользователь удалён');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
