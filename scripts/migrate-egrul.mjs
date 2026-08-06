// Миграция: колонки ЕГРЮЛ в companies.
// Запуск: node --env-file=.env.local scripts/migrate-egrul.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const statements = [
  `alter table companies add column if not exists egrul_status text`,
  `alter table companies add column if not exists egrul_name text`,
  `alter table companies add column if not exists egrul_reg_date date`,
  `alter table companies add column if not exists egrul_address text`,
  `alter table companies add column if not exists egrul_okved text`,
  `alter table companies add column if not exists egrul_data jsonb`,
  `alter table companies add column if not exists egrul_checked_at timestamptz`,
  `create index if not exists companies_egrul_status_idx on companies (egrul_status)`,
];

for (const st of statements) await sql.query(st);
console.log('Миграция применена');

const cols = await sql`
  select column_name from information_schema.columns
  where table_name = 'companies' and column_name like 'egrul%'
  order by column_name
`;
console.log('Колонки ЕГРЮЛ:', cols.map((c) => c.column_name).join(', '));
