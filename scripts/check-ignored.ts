import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    select payload, created_at from bot_actions
    where action = 'webhook_ignored' order by id desc limit 10
  `;
  console.log(JSON.stringify(rows, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
