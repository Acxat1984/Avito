// Миграция: обороты по годам + карточные поля (сотрудники, ЗСКА, ОКВЭД, адрес).
// Запуск: node --env-file=.env.local scripts/migrate-fields.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const statements = [
  // обороты по годам: {"2023": 92, "2024": 82.2, "2025": 50} в млн ₽ — структура
  // расширяемая, новые годы не требуют миграции
  `alter table companies add column if not exists turnovers jsonb default '{}'::jsonb`,
  `alter table companies add column if not exists employees int`,
  // zska: зелёный | жёлтый | красный (светофор ЗСК)
  `alter table companies add column if not exists zska text`,
  // okved: свой ОКВЭД, отдельно от данных ЕГРЮЛ
  `alter table companies add column if not exists okved text`,
  // address: фактический адрес (офис/жилой)
  `alter table companies add column if not exists address text`,
  // price_note: приписка к цене — 'нотариат', 'торг'
  `alter table companies add column if not exists price_note text`,
];

for (const st of statements) await sql.query(st);
console.log('Миграция применена');

// перенос уже распарсенного оборота последнего года в новую структуру
const migrated = await sql`
  update companies
  set turnovers = jsonb_build_object(
    coalesce(
      (regexp_match(turnover_note, '(2\\d{3})[^0-9]*$'))[1],
      case when turnover_last_m is not null then '2024' end
    ),
    turnover_last_m
  )
  where turnover_last_m is not null
    and (turnovers is null or turnovers = '{}'::jsonb)
  returning id
`;
console.log(`Перенесено оборотов в новую структуру: ${migrated.length}`);

const cols = await sql`
  select column_name from information_schema.columns
  where table_name = 'companies'
    and column_name in ('turnovers','employees','zska','okved','address','price_note')
  order by column_name
`;
console.log('Новые колонки:', cols.map((c) => c.column_name).join(', '));
