// Применение lib/db/schema.sql к базе из DATABASE_URL.
// Запуск: node --env-file=.env.local scripts/apply-schema.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан');
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(new URL('../lib/db/schema.sql', import.meta.url), 'utf8');

// схема не содержит функций/долларовых строк — простое разбиение по ';' безопасно
const statements = schema
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const st of statements) {
  await sql.query(st);
}
console.log(`Применено выражений: ${statements.length}`);

const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name
`;
console.log('Таблицы:', tables.map((t) => t.table_name).join(', '));
