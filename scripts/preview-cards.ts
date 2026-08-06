/** Как выглядят карточки после импорта (проверка перед показом владельцу). */
import { neon } from '@neondatabase/serverless';
import { formatCompanyCard, CompanyLike } from '../lib/format/company-card';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`select * from companies order by id limit 3`;
  for (const c of rows) {
    console.log(formatCompanyCard(c as unknown as CompanyLike));
    console.log('---');
  }
  const [t] = await sql`
    select count(*)::int as total,
      count(*) filter (where egrul_status = 'ACTIVE')::int as active,
      count(*) filter (where turnover_note is not null)::int as with_notes
    from companies
  `;
  console.log(`\nВсего ${t.total}, действующих по ЕГРЮЛ ${t.active}, с пометками по оборотам ${t.with_notes}`);
  const notes = await sql`select id, name, turnover_note from companies where turnover_note is not null`;
  for (const n of notes) console.log(`  № ${n.id} ${n.name}: ${n.turnover_note}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
