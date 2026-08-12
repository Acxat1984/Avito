/**
 * Дозаполнение существующих карточек: раскладывает обороты по годам из
 * turnover_note и приводит банки к каноническим названиям.
 *
 * Ничего не затирает: обороты доливаются к уже известным годам, банки
 * пишутся только если поле пустое или распозналось иначе.
 *
 * Запуск:  node --env-file=.env.local --experimental-strip-types scripts/backfill-turnovers.ts
 * Проверка без записи:  ... scripts/backfill-turnovers.ts --dry
 */
import { neon } from '@neondatabase/serverless';
import { parseTurnoversByYear } from '../lib/normalize/turnover';
import { findBanks } from '../lib/normalize/extra';

const sql = neon(process.env.DATABASE_URL!);
const dryRun = process.argv.includes('--dry');

async function main() {
  const rows = await sql`
    select id, name, turnover_note, turnovers, extra, banks
    from companies
    order by id
  `;
  console.log(`Карточек в базе: ${rows.length}${dryRun ? ' (пробный прогон, без записи)' : ''}\n`);

  let turnoverFixed = 0;
  let banksFixed = 0;

  for (const r of rows) {
    const id = Number(r.id);
    const name = String(r.name);
    const current = (r.turnovers ?? {}) as Record<string, number>;

    // обороты: из отдельного поля, а если там пусто — из «дополнительно»
    const parsed = {
      ...parseTurnoversByYear(String(r.extra ?? '')),
      ...parseTurnoversByYear(String(r.turnover_note ?? '')),
    };
    const merged = { ...parsed, ...current };
    const turnoversChanged = JSON.stringify(merged) !== JSON.stringify(current);

    // банки: приводим к каноническим названиям
    const banksNow = r.banks ? String(r.banks) : null;
    const banksNew = findBanks(banksNow) ?? findBanks(String(r.extra ?? '')) ?? banksNow;
    const banksChanged = banksNew !== null && banksNew !== banksNow;

    if (!turnoversChanged && !banksChanged) continue;

    const parts: string[] = [];
    if (turnoversChanged) {
      turnoverFixed++;
      parts.push(`обороты ${JSON.stringify(current)} → ${JSON.stringify(merged)}`);
    }
    if (banksChanged) {
      banksFixed++;
      parts.push(`банки «${banksNow ?? '—'}» → «${banksNew}»`);
    }
    console.log(`#${id} ${name}: ${parts.join('; ')}`);

    if (dryRun) continue;

    const years = Object.keys(merged).sort();
    const last = years.length ? merged[years[years.length - 1]] : null;

    await sql`
      update companies set
        turnovers       = ${JSON.stringify(merged)}::jsonb,
        turnover_last_m = coalesce(${last}, turnover_last_m),
        banks           = coalesce(${banksNew}, banks),
        updated_at      = now()
      where id = ${id}
    `;
    await sql`
      insert into company_audit (company_id, actor, changes)
      values (${id}, 'backfill', ${JSON.stringify({
        turnovers: turnoversChanged ? { old: current, new: merged } : undefined,
        banks: banksChanged ? { old: banksNow, new: banksNew } : undefined,
      })}::jsonb)
    `;
  }

  console.log(`\nИтого: обороты разложены у ${turnoverFixed}, банки уточнены у ${banksFixed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
