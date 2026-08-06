/** item_id объявлений по последним чатам + свежие processed_messages. */
import { neon } from '@neondatabase/serverless';
import { listChats } from '../lib/avito/client';

async function main() {
  const chats = await listChats(10, 0);
  for (const c of chats) {
    console.log(
      `чат ${c.id} | item_id: ${c.context?.value?.id ?? '—'} | ${(c.context?.value?.title ?? '—').slice(0, 60)}`,
    );
  }
  const sql = neon(process.env.DATABASE_URL!);
  const p = await sql`select * from processed_messages order by processed_at desc limit 5`;
  console.log('processed_messages:', JSON.stringify(p));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
