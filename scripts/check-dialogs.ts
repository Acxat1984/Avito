import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const d = await sql`
    select id, avito_chat_id, intent, status, bot_messages_sent, created_at
    from dialogs order by id desc limit 10
  `;
  console.log('Диалогов в БД:', d.length);
  for (const x of d) console.log(JSON.stringify(x));
  const a = await sql`select action, count(*)::int as n from bot_actions group by action order by n desc`;
  console.log('Действия бота:', JSON.stringify(a));
  const p = await sql`select avito_message_id, chat_id, processed_at from processed_messages order by processed_at desc limit 5`;
  console.log('processed_messages:', JSON.stringify(p));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
