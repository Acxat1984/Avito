import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    select
      egrul_data->'data'->'address'->'data'->>'region_with_type' as region,
      egrul_data->'data'->'address'->'data'->>'region_kladr_id' as kladr,
      count(*)::int as n,
      count(*) filter (where region_code is null)::int as no_region
    from companies
    where egrul_data is not null
    group by 1, 2 order by n desc
  `;
  for (const r of rows) {
    console.log(`${String(r.kladr).slice(0, 2)} | ${String(r.region).padEnd(32)} | всего ${r.n}, без региона в базе: ${r.no_region}`);
  }
  const [{ n }] = await sql`select count(*)::int as n from companies where region_code is null`;
  console.log(`\nВсего карточек без region_code: ${n}`);
  const [{ y }] = await sql`select count(*)::int as y from companies where year_reg is null and egrul_reg_date is not null`;
  console.log(`Карточек без года, но с датой из ЕГРЮЛ: ${y}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
