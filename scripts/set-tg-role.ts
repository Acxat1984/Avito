/**
 * Смена роли пользователя Telegram-бота.
 * Запуск: env из .env.local, затем npx tsx scripts/set-tg-role.ts <chat_id> <role>
 * Роли: admin | partner | guest | blocked
 */
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const ROLES = ['admin', 'partner', 'guest', 'blocked'];

async function main() {
  const [chatIdArg, role] = process.argv.slice(2);
  const chatId = Number(chatIdArg);
  if (!Number.isFinite(chatId) || !ROLES.includes(role)) {
    console.error('Использование: npx tsx scripts/set-tg-role.ts <chat_id> <admin|partner|guest|blocked>');
    process.exit(1);
  }

  const [row] = await sql`
    insert into tg_users (chat_id, role) values (${chatId}, ${role})
    on conflict (chat_id) do update set role = ${role}
    returning chat_id, username, full_name, role
  `;
  console.log(`Роль обновлена: ${row.full_name ?? ''} ${row.username ? '@' + row.username : ''} (${row.chat_id}) → ${row.role}`);

  const all = await sql`select chat_id, username, full_name, role from tg_users order by role, chat_id`;
  console.log('\nВсе пользователи бота:');
  for (const u of all) {
    console.log(`  ${u.role.padEnd(8)} | ${u.full_name ?? '—'} ${u.username ? '@' + u.username : ''} (${u.chat_id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
