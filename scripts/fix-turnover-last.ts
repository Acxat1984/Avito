/**
 * Пересчёт turnover_last_m: должен содержать оборот последнего ЗАВЕРШЁННОГО года.
 * Текущий год неполный и занижает картину — по нему нельзя фильтровать.
 */
import { neon } from '@neondatabase/serverless';
import { lastFullYearTurnover } from '../lib/format/company-card';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`select id, name, turnovers, turnover_last_m from companies where turnovers <> '{}'::jsonb`;
  let updated = 0;
  for (const c of rows) {
    const turn = lastFullYearTurnover(c.turnovers as Record<string, number>);
    const next = turn ? turn.value : null;
    const prev = c.turnover_last_m === null ? null : Number(c.turnover_last_m);
    if (next === prev) continue;
    await sql`update companies set turnover_last_m = ${next} where id = ${c.id}`;
    console.log(`  № ${c.id} ${c.name}: ${prev} → ${next}${turn ? ` (${turn.year})` : ''}`);
    updated++;
  }
  console.log(`\nОбновлено карточек: ${updated} из ${rows.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
