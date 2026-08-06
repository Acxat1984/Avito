/**
 * Одноразовый перелив базы из 11.xlsx (задача владельца от 2026-08-03):
 * - полная очистка companies (+ staging импортов);
 * - Excel-строки 2..34 (МИКУРАТЕХ..ТРАНСРУ) → status 'verified' (актуальные);
 * - Excel-строки 35+ (каскад и ниже) → status 'draft' + пометка об актуализации.
 * Запуск: npx tsx --env-file=.env.local scripts/reimport-11.ts
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { normalizeCompany } from '../lib/normalize';

const sql = neon(process.env.DATABASE_URL!);

const wb = XLSX.read(readFileSync('C:/avito/11.xlsx'), { type: 'buffer', cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

// колонки: 0 название, 1 инн, 2 продавец тел, 3 обороты, 4 цена закупа,
// 5 цена, 6 система налог, 7 город, 8 год, 9 дополнительно, 10 код деятельности
function toInput(r: unknown[]) {
  return {
    name: r[0],
    inn: r[1],
    seller_contact: r[2],
    turnover: r[3],
    buy_price: r[4],
    price: r[5],
    tax: r[6],
    city: r[7],
    year: r[8],
    extra: r[9],
    unnamed: r[10] != null && String(r[10]).trim() !== '' ? [`код деятельности: ${r[10]}`] : [],
  };
}

const isEmptyRow = (r: unknown[]) =>
  (r[0] == null || String(r[0]).trim() === '') && (r[1] == null || String(r[1]).trim() === '');

// массив-индекс = Excel-строка − 1: ТРАНСРУ = Excel 34 = index 33; каскад = Excel 35 = index 34
const actual = rows.slice(1, 34).filter((r) => !isEmptyRow(r));
const outreach = rows.slice(34).filter((r) => !isEmptyRow(r));

console.log(`Актуальные (→ verified): ${actual.length}`);
console.log(`Каскад и ниже (→ draft): ${outreach.length}`);
console.log(`Первая актуальная: ${actual[0]?.[0]}, последняя: ${actual[actual.length - 1]?.[0]}`);
console.log(`Первая для рассылки: ${outreach[0]?.[0]}, последняя: ${outreach[outreach.length - 1]?.[0]}`);

async function main() {
const [{ n: before }] = await sql`select count(*)::int as n from companies`;
console.log(`\nКомпаний в базе до очистки: ${before}`);

// очистка: физическое удаление по прямому указанию владельца
await sql`delete from company_audit`;
await sql`update leads set company_id = null where company_id is not null`;
await sql`delete from import_rows`;
await sql`delete from imports`;
await sql`delete from companies`;
console.log('База компаний очищена');

async function insertGroup(group: unknown[][], status: string, extraNote: string | null) {
  let inserted = 0;
  for (const r of group) {
    const norm = normalizeCompany(toInput(r));
    const name = norm.name ?? norm.inn_raw ?? 'Без названия';
    const notes = [extraNote, ...norm.problems].filter(Boolean).join('; ') || null;
    const [row] = await sql`
      insert into companies (
        name, inn, inn_raw, seller_contact, region_code, city_raw,
        year_reg, year_raw, turnover_note, turnover_last_m,
        price_k, price_raw, buy_price_k, tax_system, tax_raw,
        extra, has_license, banks, status, source, needs_review, review_notes
      ) values (
        ${name}, ${norm.inn}, ${norm.inn_raw}, ${norm.seller_contact}, ${norm.region_code}, ${norm.city_raw},
        ${norm.year_reg}, ${norm.year_raw}, ${norm.turnover_note}, ${norm.turnover_last_m},
        ${norm.price_k}, ${norm.price_raw}, ${norm.buy_price_k}, ${norm.tax_system}, ${norm.tax_raw},
        ${norm.extra}, ${norm.has_license}, ${norm.banks}, ${status}, 'import',
        ${norm.needs_review || extraNote !== null}, ${notes}
      ) returning id
    `;
    await sql`
      insert into company_audit (company_id, actor, changes)
      values (${row.id}, 'import:11.xlsx', ${JSON.stringify({ created: { old: null, new: `${name} (${status})` } })}::jsonb)
    `;
    inserted++;
  }
  return inserted;
}

const a = await insertGroup(actual, 'verified', null);
const o = await insertGroup(outreach, 'draft', 'ожидает актуализации: исходящий запрос в Avito');

const [{ n: after }] = await sql`select count(*)::int as n from companies`;
const [{ n: nr }] = await sql`select count(*)::int as n from companies where needs_review`;
console.log(`\nИмпортировано: verified=${a}, draft=${o}, всего в базе=${after}, needs_review=${nr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
