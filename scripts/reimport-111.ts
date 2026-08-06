/**
 * Полная замена базы данными из 111.xlsx (решение владельца от 2026-08-04).
 * Файл: 35 компаний, обороты отдельными колонками 23/24/25/26 → годы 2023..2026.
 *
 * Договорённости:
 *  - все компании заносятся со статусом verified (сразу в продажу);
 *  - 0 в оборотах трактуется как «нет данных» и не записывается;
 *  - «мин» сохраняется пометкой в turnover_note, числом не становится;
 *  - старая база удаляется полностью, вместе с диалогами, лидами и выдачами.
 *
 * Запуск: env из .env.local, затем npx tsx scripts/reimport-111.ts
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { normalizeInn, normalizeYear, normalizeRegion, normalizeTax, normalizePrice, normalizeExtra } from '../lib/normalize';

const sql = neon(process.env.DATABASE_URL!);

const COL = {
  name: 0, inn: 1, phone: 2,
  t23: 3, t24: 4, t25: 5, t26: 6,
  buyPrice: 7, price: 8, tax: 9, city: 10, year: 11, extra: 12, okved: 13,
} as const;

/** Колонка оборотов → год. */
const TURNOVER_YEARS: Array<[keyof typeof COL, string]> = [
  ['t23', '2023'], ['t24', '2024'], ['t25', '2025'], ['t26', '2026'],
];

interface TurnoverParse {
  values: Record<string, number>;
  notes: string[];
}

/** 0 → «нет данных» (пропуск), «мин» → пометка без числа. */
function parseTurnovers(row: unknown[]): TurnoverParse {
  const values: Record<string, number> = {};
  const notes: string[] = [];
  for (const [col, year] of TURNOVER_YEARS) {
    const raw = row[COL[col]];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const s = String(raw).trim().toLowerCase();
    if (s === '0') continue;                    // нет данных
    if (/мин/.test(s)) { notes.push(`${year}: минимальные`); continue; }
    const n = Number(s.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) values[year] = n;
    else notes.push(`${year}: ${raw}`);
  }
  return { values, notes };
}

async function main() {
  const wb = XLSX.read(readFileSync('C:/avito/111.xlsx'), { type: 'buffer', cellDates: true });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Лист1'], { header: 1, defval: null });
  const data = rows.slice(1).filter((r) => (r ?? []).some((c) => c !== null && String(c).trim() !== ''));
  console.log(`Строк с данными в файле: ${data.length}`);

  const [before] = await sql`select count(*)::int as n from companies`;
  console.log(`Компаний в базе до очистки: ${before.n}`);

  // полная очистка (подтверждено владельцем)
  await sql`delete from company_audit`;
  await sql`delete from bot_actions`;
  await sql`delete from leads`;
  await sql`delete from processed_messages`;
  await sql`delete from dialogs`;
  await sql`delete from offers`;
  await sql`delete from import_rows`;
  await sql`delete from imports`;
  await sql`delete from companies`;
  await sql`alter sequence companies_id_seq restart with 1`;
  console.log('База очищена, нумерация карточек начнётся с 1');

  const problems: string[] = [];
  let inserted = 0;

  for (const r of data) {
    const name = String(r[COL.name] ?? '').trim();
    const inn = normalizeInn(r[COL.inn]);
    const year = normalizeYear(r[COL.year]);
    const region = normalizeRegion(r[COL.city]);
    const tax = normalizeTax(r[COL.tax]);
    const price = normalizePrice(r[COL.price]);
    const buyPrice = normalizePrice(r[COL.buyPrice]);
    const { values: turnovers, notes: turnNotes } = parseTurnovers(r);
    const extraCell = normalizeExtra(r[COL.extra], []);

    const years = Object.keys(turnovers).sort();
    const lastTurnover = years.length ? turnovers[years[years.length - 1]] : null;
    const turnoverNote = turnNotes.length ? turnNotes.join('; ') : null;

    const okved = r[COL.okved] !== null ? String(r[COL.okved]).trim() : null;
    const rowProblems = [
      ...inn.problems, ...year.problems, ...region.problems, ...tax.problems,
    ];
    const needsReview = inn.needsReview || year.needsReview || region.needsReview || tax.needsReview;
    if (rowProblems.length) problems.push(`${name}: ${rowProblems.join('; ')}`);

    await sql`
      insert into companies (
        name, inn, inn_raw, seller_contact,
        region_code, city_raw, year_reg, year_raw,
        turnovers, turnover_last_m, turnover_note,
        price_k, price_raw, buy_price_k,
        tax_system, tax_raw, okved, extra, banks, has_license,
        status, source, needs_review, review_notes
      ) values (
        ${name}, ${inn.value}, ${inn.raw},
        ${r[COL.phone] !== null ? String(r[COL.phone]) : null},
        ${region.value}, ${region.raw}, ${year.value}, ${year.raw},
        ${JSON.stringify(turnovers)}::jsonb, ${lastTurnover}, ${turnoverNote},
        ${price.value}, ${price.raw}, ${buyPrice.value},
        ${tax.value}, ${tax.raw}, ${okved}, ${extraCell.extra}, ${extraCell.banks}, ${extraCell.has_license},
        'verified', 'import', ${needsReview}, ${rowProblems.length ? rowProblems.join('; ') : null}
      )
    `;
    inserted++;
  }

  console.log(`\nЗагружено компаний: ${inserted} (статус verified)`);
  if (problems.length) {
    console.log(`\nТребуют внимания (${problems.length}):`);
    problems.forEach((p) => console.log(`  • ${p}`));
  }

  const [stats] = await sql`
    select count(*)::int as total,
           count(*) filter (where region_code is null)::int as no_region,
           count(*) filter (where year_reg is null)::int as no_year,
           count(*) filter (where turnovers <> '{}'::jsonb)::int as with_turnovers,
           count(*) filter (where price_k is not null)::int as with_price
    from companies
  `;
  console.log(
    `\nИтог: всего ${stats.total}, без региона ${stats.no_region}, без года ${stats.no_year}, ` +
      `с оборотами ${stats.with_turnovers}, с ценой ${stats.with_price}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
