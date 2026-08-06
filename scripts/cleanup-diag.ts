import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`delete from bot_actions where dialog_id in (select id from dialogs where avito_chat_id = 'diag-test-chat')`;
  await sql`delete from processed_messages where chat_id = 'diag-test-chat'`;
  await sql`delete from dialogs where avito_chat_id = 'diag-test-chat'`;
  console.log('диагностические записи удалены');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
