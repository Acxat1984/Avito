'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { NormalizedCompany } from '@/lib/normalize';
import { buildUpdateChanges } from '@/lib/import/match';

/**
 * Сохранение карточек, разобранных из текста сообщений.
 * Новые → insert (draft, needs_review); совпавшие → update по правилу
 * «никогда не затираем пустым» + запись в company_audit.
 */
export async function saveParsedCompanies(
  items: Array<{ normalized: NormalizedCompany; matchId: number | null }>,
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const n = item.normalized;
    const name = n.name ?? n.inn_raw ?? 'Без названия';
    const notes = ['добавлено из сообщения Avito', ...n.problems].join('; ');

    if (item.matchId === null) {
      const [row] = await sql`
        insert into companies (
          name, inn, inn_raw, seller_contact, region_code, city_raw,
          year_reg, year_raw, turnover_note, turnover_last_m,
          price_k, price_raw, tax_system, tax_raw, extra, has_license, banks,
          status, source, needs_review, review_notes
        ) values (
          ${name}, ${n.inn}, ${n.inn_raw}, ${n.seller_contact}, ${n.region_code}, ${n.city_raw},
          ${n.year_reg}, ${n.year_raw}, ${n.turnover_note}, ${n.turnover_last_m},
          ${n.price_k}, ${n.price_raw}, ${n.tax_system}, ${n.tax_raw}, ${n.extra}, ${n.has_license}, ${n.banks},
          'draft', 'manual', true, ${notes}
        ) returning id
      `;
      await sql`
        insert into company_audit (company_id, actor, changes)
        values (${row.id}, 'admin:paste', ${JSON.stringify({ created: { old: null, new: name } })}::jsonb)
      `;
      inserted++;
      continue;
    }

    const [existing] = await sql`select * from companies where id = ${item.matchId}`;
    if (!existing) continue;
    const changes = buildUpdateChanges(existing, n);
    if (Object.keys(changes).length === 0) continue;

    const newVals: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes)) newVals[k] = v.new;

    await sql`
      update companies c set
        name            = coalesce(s.nv->>'name', c.name),
        inn             = coalesce(s.nv->>'inn', c.inn),
        inn_raw         = coalesce(s.nv->>'inn_raw', c.inn_raw),
        seller_contact  = coalesce(s.nv->>'seller_contact', c.seller_contact),
        region_code     = coalesce(s.nv->>'region_code', c.region_code),
        city_raw        = coalesce(s.nv->>'city_raw', c.city_raw),
        year_reg        = coalesce((s.nv->>'year_reg')::int, c.year_reg),
        year_raw        = coalesce(s.nv->>'year_raw', c.year_raw),
        turnover_note   = coalesce(s.nv->>'turnover_note', c.turnover_note),
        turnover_last_m = coalesce((s.nv->>'turnover_last_m')::numeric, c.turnover_last_m),
        price_k         = coalesce((s.nv->>'price_k')::numeric, c.price_k),
        price_raw       = coalesce(s.nv->>'price_raw', c.price_raw),
        tax_system      = coalesce(s.nv->>'tax_system', c.tax_system),
        tax_raw         = coalesce(s.nv->>'tax_raw', c.tax_raw),
        extra           = coalesce(s.nv->>'extra', c.extra),
        has_license     = coalesce((s.nv->>'has_license')::boolean, c.has_license),
        banks           = coalesce(s.nv->>'banks', c.banks),
        updated_at      = now()
      from (select ${JSON.stringify(newVals)}::jsonb as nv) s
      where c.id = ${item.matchId}
    `;
    await sql`
      insert into company_audit (company_id, actor, changes)
      values (${item.matchId}, 'admin:paste', ${JSON.stringify(changes)}::jsonb)
    `;
    updated++;
  }

  revalidatePath('/admin/companies');
  return { inserted, updated };
}
