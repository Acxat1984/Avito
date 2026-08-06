// Миграция: пользователи Telegram-бота и их роли.
// Запуск: node --env-file=.env.local scripts/migrate-tg-users.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  create table if not exists tg_users (
    chat_id     bigint primary key,
    username    text,
    full_name   text,
    role        text not null default 'guest',  -- admin | partner | guest | blocked
    note        text,
    requests    int default 0,
    created_at  timestamptz default now(),
    last_seen   timestamptz default now()
  )
`;
await sql`create index if not exists tg_users_role_idx on tg_users (role)`;
console.log('Таблица tg_users создана');
