import { sql } from '@/lib/db/client';
import { MatchedRow, buildUpdateChanges, Changes } from './match';

export interface ImportStats {
  insert: number;
  update: number;
  skip: number;
  conflict: number;
  with_problems: number;
}

/** Фаза 1: сохранить staging (imports + import_rows), вернуть id и статистику. */
export async function createImport(
  filename: string,
  uploadedBy: string,
  rows: MatchedRow[],
): Promise<{ importId: number; stats: ImportStats }> {
  const stats: ImportStats = {
    insert: rows.filter((r) => r.action === 'insert').length,
    update: rows.filter((r) => r.action === 'update').length,
    skip: rows.filter((r) => r.action === 'skip').length,
    conflict: rows.filter((r) => r.action === 'conflict').length,
    with_problems: rows.filter((r) => r.problems.length > 0).length,
  };

  const [imp] = await sql`
    insert into imports (filename, uploaded_by, stats, status)
    values (${filename}, ${uploadedBy}, ${JSON.stringify(stats)}::jsonb, 'pending')
    returning id
  `;
  const importId = Number(imp.id);

  if (rows.length) {
    await sql.transaction(
      rows.map(
        (r) => sql`
          insert into import_rows (import_id, row_num, raw, parsed, match_company_id, action, problems)
          values (
            ${importId}, ${r.rowNum},
            ${JSON.stringify(r.raw)}::jsonb, ${JSON.stringify(r.parsed)}::jsonb,
            ${r.matchCompanyId}, ${r.action}, ${r.problems}
          )
        `,
      ),
    );
  }

  return { importId, stats };
}

interface StagedRow {
  id: number;
  row_num: number;
  parsed: Record<string, unknown>;
  match_company_id: number | null;
  action: string;
  problems: string[] | null;
}

/**
 * Фаза 2: транзакционно применить импорт. Каждая правка — в company_audit
 * с actor 'import:<id>'. Conflict-строки не трогаем (разруливаются вручную).
 */
export async function applyImport(importId: number): Promise<{
  ok: boolean;
  error?: string;
  applied?: { inserted: number; updated: number; unchanged: number };
}> {
  const [imp] = await sql`select id, status from imports where id = ${importId}`;
  if (!imp) return { ok: false, error: 'Импорт не найден' };
  if (imp.status !== 'pending') return { ok: false, error: `Импорт уже в статусе ${imp.status}` };

  const staged = (await sql`
    select id, row_num, parsed, match_company_id, action, problems
    from import_rows
    where import_id = ${importId} and action in ('insert', 'update')
    order by row_num
  `) as unknown as StagedRow[];

  const updateIds = staged
    .filter((r) => r.action === 'update' && r.match_company_id !== null)
    .map((r) => Number(r.match_company_id));
  const existingRows = updateIds.length
    ? await sql`select * from companies where id = any(${updateIds})`
    : [];
  const existingById = new Map(existingRows.map((c) => [Number(c.id), c]));

  const actor = `import:${importId}`;
  const queries = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of staged) {
    const p = row.parsed as Record<string, never>;
    const problems = (row.problems ?? []) as string[];
    const reviewNotes = problems.length ? problems.join('; ') : null;

    if (row.action === 'insert') {
      inserted++;
      const name = (p.name as string | null) ?? (p.inn_raw as string | null) ?? 'Без названия';
      const auditChanges: Changes = {};
      for (const [k, v] of Object.entries(p)) {
        if (k === 'problems' || v === null || v === false) continue;
        auditChanges[k] = { old: null, new: v };
      }
      queries.push(sql`
        with c as (
          insert into companies (
            name, inn, inn_raw, seller_contact, region_code, city_raw,
            year_reg, year_raw, turnover_note, turnover_last_m,
            price_k, price_raw, buy_price_k, tax_system, tax_raw,
            extra, has_license, banks,
            status, source, needs_review, review_notes
          ) values (
            ${name}, ${p.inn}, ${p.inn_raw}, ${p.seller_contact}, ${p.region_code}, ${p.city_raw},
            ${p.year_reg}, ${p.year_raw}, ${p.turnover_note}, ${p.turnover_last_m},
            ${p.price_k}, ${p.price_raw}, ${p.buy_price_k}, ${p.tax_system}, ${p.tax_raw},
            ${p.extra}, ${p.has_license ?? false}, ${p.banks},
            'draft', 'import', ${p.needs_review ?? false}, ${reviewNotes}
          ) returning id
        )
        insert into company_audit (company_id, actor, changes)
        select id, ${actor}, ${JSON.stringify(auditChanges)}::jsonb from c
      `);
      continue;
    }

    // update
    const existing = existingById.get(Number(row.match_company_id));
    if (!existing) {
      unchanged++;
      continue;
    }
    const changes = buildUpdateChanges(existing, row.parsed as never);
    if (Object.keys(changes).length === 0) {
      unchanged++;
      continue;
    }
    updated++;

    const newVals: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes)) newVals[k] = v.new;
    if (p.needs_review === true) {
      newVals.needs_review = true;
      if (reviewNotes) newVals.review_notes = reviewNotes;
    }

    // coalesce по jsonb: отсутствующее поле → null → старое значение остаётся
    queries.push(sql`
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
        buy_price_k     = coalesce((s.nv->>'buy_price_k')::numeric, c.buy_price_k),
        tax_system      = coalesce(s.nv->>'tax_system', c.tax_system),
        tax_raw         = coalesce(s.nv->>'tax_raw', c.tax_raw),
        extra           = coalesce(s.nv->>'extra', c.extra),
        has_license     = coalesce((s.nv->>'has_license')::boolean, c.has_license),
        banks           = coalesce(s.nv->>'banks', c.banks),
        needs_review    = coalesce((s.nv->>'needs_review')::boolean, c.needs_review),
        review_notes    = coalesce(s.nv->>'review_notes', c.review_notes),
        updated_at      = now()
      from (select ${JSON.stringify(newVals)}::jsonb as nv) s
      where c.id = ${Number(row.match_company_id)}
    `);
    queries.push(sql`
      insert into company_audit (company_id, actor, changes)
      values (${Number(row.match_company_id)}, ${actor}, ${JSON.stringify(changes)}::jsonb)
    `);
  }

  queries.push(sql`
    update imports set
      status = 'applied',
      stats = coalesce(stats, '{}'::jsonb) || ${JSON.stringify({ applied: { inserted, updated, unchanged } })}::jsonb
    where id = ${importId}
  `);

  await sql.transaction(queries);
  return { ok: true, applied: { inserted, updated, unchanged } };
}

/** Отмена импорта: staging остаётся для истории. */
export async function cancelImport(importId: number): Promise<{ ok: boolean; error?: string }> {
  const [imp] = await sql`select id, status from imports where id = ${importId}`;
  if (!imp) return { ok: false, error: 'Импорт не найден' };
  if (imp.status !== 'pending') return { ok: false, error: `Импорт уже в статусе ${imp.status}` };
  await sql`update imports set status = 'cancelled' where id = ${importId}`;
  return { ok: true };
}
