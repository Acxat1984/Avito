/** Проверка быстрого добавления по ИНН (создаёт и сразу удаляет тестовую карточку). */
import { neon } from '@neondatabase/serverless';
import { createCompanyFromInn } from '../lib/companies/create-from-inn';
import { formatCompanyCard, CompanyLike } from '../lib/format/company-card';
import { parseShortInput } from '../lib/telegram/parse-short';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const input = '7707083893 тел 89031234567 закуп 50 цена 200 альфа, офис';
  const parsed = parseShortInput(input);
  console.log('Разобрано:', JSON.stringify(parsed));

  const r = await createCompanyFromInn({ ...parsed, inn: parsed.inn!, actor: 'test' });
  if (!r.ok) {
    console.log('Результат:', r.error);
    return;
  }
  const [c] = await sql`select * from companies where id = ${r.id}`;
  console.log('\n--- карточка ---');
  console.log(formatCompanyCard(c as unknown as CompanyLike, { showBuyPrice: true }));
  console.log('\nДозаполнить:', r.warnings.join('; '));

  await sql`delete from company_audit where company_id = ${r.id}`;
  await sql`delete from companies where id = ${r.id}`;
  console.log('\nТестовая карточка удалена');
}

main().catch((e) => { console.error(e); process.exit(1); });
