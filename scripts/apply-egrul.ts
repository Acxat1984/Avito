/**
 * По результатам проверки ЕГРЮЛ:
 *  1) ликвидированные (LIQUIDATED) → archived;
 *  2) verified в процессе ликвидации/банкротства → draft (снять с продажи);
 *  3) заполнить пустые поля карточек данными ЕГРЮЛ (год, регион, город, адрес).
 * Каждое изменение пишется в company_audit (actor 'egrul').
 * Запуск: env из .env.local, затем npx tsx scripts/apply-egrul.ts
 */
import { neon } from '@neondatabase/serverless';
import { regionFromKladr } from '../lib/normalize/regions';

const sql = neon(process.env.DATABASE_URL!);

async function audit(companyId: number, changes: Record<string, { old: unknown; new: unknown }>) {
  await sql`
    insert into company_audit (company_id, actor, changes)
    values (${companyId}, 'egrul', ${JSON.stringify(changes)}::jsonb)
  `;
}

async function main() {
  // 1. Ликвидированные → архив
  const liquidated = (await sql`
    select id, name, status from companies
    where egrul_status = 'LIQUIDATED' and status <> 'archived'
  `) as unknown as Array<{ id: number; name: string; status: string }>;

  for (const c of liquidated) {
    await sql`
      update companies set status = 'archived',
        review_notes = coalesce(review_notes || '; ', '') || 'ликвидирована по ЕГРЮЛ — в архив',
        updated_at = now()
      where id = ${c.id}
    `;
    await audit(c.id, { status: { old: c.status, new: 'archived' } });
    console.log(`  архив: ${c.name}`);
  }
  console.log(`Заархивировано ликвидированных: ${liquidated.length}\n`);

  // 2. verified в процессе ликвидации/банкротства → draft
  const risky = (await sql`
    select id, name, status, egrul_status from companies
    where status = 'verified' and egrul_status in ('LIQUIDATING', 'BANKRUPT', 'REORGANIZING', 'NOT_FOUND')
  `) as unknown as Array<{ id: number; name: string; status: string; egrul_status: string }>;

  for (const c of risky) {
    await sql`
      update companies set status = 'draft', needs_review = true,
        review_notes = coalesce(review_notes || '; ', '') || ${'снята с продажи: статус ЕГРЮЛ ' + c.egrul_status},
        updated_at = now()
      where id = ${c.id}
    `;
    await audit(c.id, { status: { old: 'verified', new: 'draft' } });
    console.log(`  снята с продажи: ${c.name} (${c.egrul_status})`);
  }
  console.log(`Снято с продажи: ${risky.length}\n`);

  // 3. Обогащение пустых полей данными ЕГРЮЛ
  const toEnrich = (await sql`
    select id, name, year_reg, region_code, city_raw, extra, egrul_reg_date, egrul_address, egrul_okved,
           egrul_data->'data'->'address'->'data'->>'region_kladr_id' as kladr,
           egrul_data->'data'->'address'->'data'->>'city' as egrul_city,
           egrul_data->'data'->'address'->'data'->>'settlement' as egrul_settlement
    from companies
    where egrul_data is not null
  `) as unknown as Array<Record<string, never>>;

  let enriched = 0;
  const stats = { year: 0, region: 0, city: 0, address: 0 };

  for (const c of toEnrich) {
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const sets: Record<string, unknown> = {};

    // год регистрации из ЕГРЮЛ, если в карточке пусто
    if (!c.year_reg && c.egrul_reg_date) {
      const y = new Date(String(c.egrul_reg_date)).getFullYear();
      sets.year_reg = y;
      changes.year_reg = { old: null, new: y };
      stats.year++;
    }

    // регион по KLADR, если не распознан
    if (!c.region_code) {
      const cityName = (c.egrul_city ?? c.egrul_settlement) as string | null;
      const code = regionFromKladr(c.kladr as string | null, cityName);
      if (code) {
        sets.region_code = code;
        changes.region_code = { old: null, new: code };
        stats.region++;
      }
    }

    // город из ЕГРЮЛ, если пусто
    if (!c.city_raw && (c.egrul_city || c.egrul_settlement)) {
      const city = String(c.egrul_city ?? c.egrul_settlement);
      sets.city_raw = city;
      changes.city_raw = { old: null, new: city };
      stats.city++;
    }

    // юр. адрес в «дополнительно», если его там ещё нет
    if (c.egrul_address && !String(c.extra ?? '').includes(String(c.egrul_address))) {
      const extra = [c.extra, `юр. адрес (ЕГРЮЛ): ${c.egrul_address}`].filter(Boolean).join('; ');
      sets.extra = extra;
      changes.extra = { old: c.extra ?? null, new: extra };
      stats.address++;
    }

    if (Object.keys(sets).length === 0) continue;

    await sql`
      update companies c set
        year_reg    = coalesce((s.nv->>'year_reg')::int, c.year_reg),
        region_code = coalesce(s.nv->>'region_code', c.region_code),
        city_raw    = coalesce(s.nv->>'city_raw', c.city_raw),
        extra       = coalesce(s.nv->>'extra', c.extra),
        updated_at  = now()
      from (select ${JSON.stringify(sets)}::jsonb as nv) s
      where c.id = ${Number(c.id)}
    `;
    await audit(Number(c.id), changes);
    enriched++;
  }

  console.log(`Обогащено карточек: ${enriched}`);
  console.log(`  год регистрации: +${stats.year}`);
  console.log(`  регион: +${stats.region}`);
  console.log(`  город: +${stats.city}`);
  console.log(`  юр. адрес: +${stats.address}`);

  const [totals] = await sql`
    select
      count(*) filter (where status = 'verified')::int as verified,
      count(*) filter (where status = 'draft')::int as draft,
      count(*) filter (where status = 'archived')::int as archived,
      count(*) filter (where region_code is null)::int as no_region,
      count(*) filter (where year_reg is null)::int as no_year,
      count(*) filter (where needs_review)::int as review
    from companies
  `;
  console.log(`\n===== БАЗА =====`);
  console.log(`verified: ${totals.verified}, draft: ${totals.draft}, archived: ${totals.archived}`);
  console.log(`без региона: ${totals.no_region}, без года: ${totals.no_year}, требуют проверки: ${totals.review}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
