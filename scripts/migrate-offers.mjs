// Миграция: таблица offers — зафиксированные выдачи списков клиентам.
// Запуск: node --env-file=.env.local scripts/migrate-offers.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  create table if not exists offers (
    id          bigserial primary key,
    code        text unique not null,      -- короткий код списка, напр. 'K7M'
    filters     jsonb,                     -- фильтры, по которым сформирован список
    company_ids bigint[] not null,         -- состав в порядке позиций 1..N
    note        text,                      -- кому отправлено (чат/имя)
    created_at  timestamptz default now()
  )
`;
await sql`create index if not exists offers_code_idx on offers (code)`;
console.log('Таблица offers создана');
