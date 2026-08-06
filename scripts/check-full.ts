import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const d = await sql`select id, avito_chat_id, avito_item_id, status, intent, bot_messages_sent, extracted from dialogs order by id desc limit 3`;
  console.log('ДИАЛОГИ:', JSON.stringify(d, null, 1));
  const a = await sql`select id, dialog_id, action, payload, created_at from bot_actions where action <> 'webhook_ignored' order by id desc limit 12`;
  console.log('ДЕЙСТВИЯ:', JSON.stringify(a, null, 1));
  const l = await sql`select * from leads order by id desc limit 3`;
  console.log('ЛИДЫ:', JSON.stringify(l, null, 1));
  const c = await sql`select id, name, inn, region_code, year_reg, tax_system, price_k, status, source, review_notes from companies where source = 'avito_bot' order by id desc limit 3`;
  console.log('КАРТОЧКИ ОТ БОТА:', JSON.stringify(c, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
