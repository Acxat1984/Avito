/**
 * Массовая проверка компаний по ЕГРЮЛ (DaData).
 * Запуск: env из .env.local, затем npx tsx scripts/check-egrul-all.ts [--force]
 * Без --force проверяются только непроверенные ранее.
 */
import { neon } from '@neondatabase/serverless';
import { findByInn, STATUS_RU } from '../lib/dadata/client';

const sql = neon(process.env.DATABASE_URL!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes('--force');

async function main() {
  const companies = (await sql`
    select id, name, inn, year_reg, status, egrul_checked_at from companies
    where inn is not null ${force ? sql`` : sql`and egrul_checked_at is null`}
    order by id
  `) as unknown as Array<{
    id: number; name: string; inn: string; year_reg: number | null; status: string;
  }>;

  console.log(`К проверке: ${companies.length} компаний\n`);
  const summary: Record<string, number> = {};
  const problems: string[] = [];

  for (const c of companies) {
    try {
      const info = await findByInn(c.inn);
      if (!info) {
        await sql`update companies set egrul_status = 'NOT_FOUND', egrul_checked_at = now() where id = ${c.id}`;
        summary.NOT_FOUND = (summary.NOT_FOUND ?? 0) + 1;
        problems.push(`${c.name} (${c.inn}): нет в ЕГРЮЛ`);
        console.log(`  ✗ ${c.name} — не найдена`);
        await sleep(120);
        continue;
      }

      const mism: string[] = [];
      if (info.status && info.status !== 'ACTIVE') mism.push(STATUS_RU[info.status] ?? info.status);
      if (info.regDate && c.year_reg && Number(info.regDate.slice(0, 4)) !== Number(c.year_reg)) {
        mism.push(`год: база ${c.year_reg} / ЕГРЮЛ ${info.regDate.slice(0, 4)}`);
      }

      await sql`
        update companies set
          egrul_status = ${info.status}, egrul_name = ${info.shortName ?? info.name},
          egrul_reg_date = ${info.regDate}, egrul_address = ${info.address},
          egrul_okved = ${info.okved}, egrul_data = ${JSON.stringify(info.raw)}::jsonb,
          egrul_checked_at = now(), updated_at = now()
        where id = ${c.id}
      `;
      summary[info.status ?? 'UNKNOWN'] = (summary[info.status ?? 'UNKNOWN'] ?? 0) + 1;
      if (mism.length) {
        problems.push(`${c.name} (${c.inn}) [${c.status}]: ${mism.join('; ')}`);
        console.log(`  ⚠ ${c.name} — ${mism.join('; ')}`);
      } else {
        console.log(`  ✓ ${c.name} — действующая`);
      }
    } catch (e) {
      console.error(`  ! ${c.name}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
    await sleep(120);
  }

  console.log('\n===== ИТОГ =====');
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${STATUS_RU[k] ?? k}: ${v}`);
  }
  if (problems.length) {
    console.log(`\nТребуют внимания (${problems.length}):`);
    problems.forEach((p) => console.log(`  • ${p}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
