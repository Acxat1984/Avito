/**
 * Дозаполнение существующих карточек:
 *  - раскладывает обороты по годам из turnover_note и «дополнительно»;
 *  - вычищает разобранные обороты из «дополнительно», чтобы одни и те же
 *    цифры не лежали в двух местах;
 *  - приводит банки к каноническим названиям.
 *
 * Данные не теряются: обороты доливаются к уже известным годам, а текст
 * «дополнительно» урезается только после того, как обороты из него
 * сохранены в turnovers. Каждая правка пишется в company_audit.
 *
 * Запуск:  npx tsx --env-file=.env.local scripts/backfill-turnovers.ts
 * Проверка без записи:  ... scripts/backfill-turnovers.ts --dry
 */
import { neon } from '@neondatabase/serverless';
import { parseTurnoversByYear, extractTurnovers } from '../lib/normalize/turnover';
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
  let extraCleaned = 0;

  for (const r of rows) {
    const id = Number(r.id);
    const name = String(r.name);
    const current = (r.turnovers ?? {}) as Record<string, number>;
    const extraNow = r.extra ? String(r.extra) : null;

    // обороты из «дополнительно» вместе с очищенным остатком текста
    const fromExtra = extraNow ? extractTurnovers(extraNow) : { byYear: {}, rest: null };
    const parsed = {
      ...fromExtra.byYear,
      ...parseTurnoversByYear(String(r.turnover_note ?? '')),
    };
    const merged = { ...parsed, ...current };
    const turnoversChanged = JSON.stringify(merged) !== JSON.stringify(current);

    // Текст урезаем, только если разобранные из него годы уже сохранены —
    // иначе цифры пропали бы вместе с текстом.
    const extraYears = Object.keys(fromExtra.byYear);
    const yearsKept = extraYears.every((y) => merged[y] !== undefined);
    const extraNew = fromExtra.rest;
    const extraChanged = extraYears.length > 0 && yearsKept && extraNew !== extraNow;

    // банки ищем по исходному тексту — до выреза оборотов
    const banksNow = r.banks ? String(r.banks) : null;
    const banksNew = findBanks(banksNow) ?? findBanks(extraNow) ?? banksNow;
    const banksChanged = banksNew !== null && banksNew !== banksNow;

    if (!turnoversChanged && !banksChanged && !extraChanged) continue;

    const parts: string[] = [];
    if (turnoversChanged) {
      turnoverFixed++;
      parts.push(`обороты ${JSON.stringify(current)} → ${JSON.stringify(merged)}`);
    }
    if (extraChanged) {
      extraCleaned++;
      parts.push(`доп «${extraNow}» → «${extraNew ?? ''}»`);
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
        extra           = case when ${extraChanged} then ${extraNew} else extra end,
        updated_at      = now()
      where id = ${id}
    `;
    await sql`
      insert into company_audit (company_id, actor, changes)
      values (${id}, 'backfill', ${JSON.stringify({
        turnovers: turnoversChanged ? { old: current, new: merged } : undefined,
        extra: extraChanged ? { old: extraNow, new: extraNew } : undefined,
        banks: banksChanged ? { old: banksNow, new: banksNew } : undefined,
      })}::jsonb)
    `;
  }

  console.log(
    `\nИтого: обороты разложены у ${turnoverFixed}, ` +
      `дубли убраны из «дополнительно» у ${extraCleaned}, банки уточнены у ${banksFixed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
