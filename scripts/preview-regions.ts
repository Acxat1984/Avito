/** Предпросмотр того, что бот покажет по кнопке «Регионы». */
import { neon } from '@neondatabase/serverless';
import { regionName } from '../lib/normalize/regions';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`
    select region_code,
           count(*) filter (where status = 'verified')::int as verified,
           count(*) filter (where status = 'draft')::int as draft
    from companies where status in ('verified','draft')
    group by region_code
    order by count(*) filter (where status = 'verified') desc, region_code
  `;
  const [t] = await sql`
    select count(*) filter (where status='verified')::int as v,
           count(*) filter (where status='draft')::int as d,
           count(*) filter (where status='archived')::int as a,
           count(*)::int as total from companies
  `;
  console.log(`🗺 Компании в продаже: ${t.v}\n`);
  for (const r of rows) {
    if (Number(r.verified) === 0) continue;
    console.log(`• ${regionName(r.region_code as string) ?? 'регион не указан'} — ${r.verified}${Number(r.draft) ? ` (+${r.draft} черн.)` : ''}`);
  }
  console.log(`\nВсего в базе: ${t.total} (в продаже ${t.v}, черновиков ${t.d}, архив ${t.a})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
