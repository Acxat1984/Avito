'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { CompanyFilters, queryCompaniesAll } from '@/lib/db/queries';
import { normalizeInn } from '@/lib/normalize';

/** Поля, редактируемые в карточке (нормализованные; raw — read-only). */
const EDITABLE_TEXT = [
  'name', 'inn', 'seller_contact', 'region_code', 'tax_system',
  'turnover_note', 'extra', 'banks', 'status', 'review_notes',
  'address', 'okved', 'zska', 'price_note',
] as const;
const EDITABLE_NUM = [
  'year_reg', 'turnover_last_m', 'price_k', 'buy_price_k', 'employees',
] as const;

function formValue(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Раздел 7: каждая правка → company_audit (actor 'admin');
 * отметка «проверено» сбрасывает needs_review; удаление = archived.
 */
export async function updateCompany(id: number, fd: FormData) {
  const [existing] = await sql`select * from companies where id = ${id}`;
  if (!existing) throw new Error('Компания не найдена');

  const updates: Record<string, unknown> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const f of EDITABLE_TEXT) {
    const nv = formValue(fd, f);
    const ov = (existing[f] as string | null) ?? null;
    if (nv !== ov) {
      updates[f] = nv;
      changes[f] = { old: ov, new: nv };
    }
  }
  for (const f of EDITABLE_NUM) {
    const raw = formValue(fd, f);
    const nv = raw === null ? null : Number(raw.replace(',', '.'));
    if (nv !== null && !Number.isFinite(nv)) continue;
    const ov = existing[f] === null ? null : Number(existing[f]);
    if (nv !== ov) {
      updates[f] = nv;
      changes[f] = { old: ov, new: nv };
    }
  }

  const hasLicense = fd.get('has_license') === 'on';
  if (hasLicense !== Boolean(existing.has_license)) {
    updates.has_license = hasLicense;
    changes.has_license = { old: Boolean(existing.has_license), new: hasLicense };
  }

  // обороты по годам (поля turnover_<год>)
  const turnovers = collectTurnovers(fd);
  if (Object.keys(turnovers).length > 0 || fd.has('turnovers_present')) {
    const old = (existing.turnovers ?? {}) as Record<string, number>;
    if (JSON.stringify(old) !== JSON.stringify(turnovers)) {
      updates.turnovers = JSON.stringify(turnovers);
      changes.turnovers = { old, new: turnovers };
      const years = Object.keys(turnovers).sort();
      const last = years.length ? turnovers[years[years.length - 1]] : null;
      if (last !== (existing.turnover_last_m === null ? null : Number(existing.turnover_last_m))) {
        updates.turnover_last_m = last;
        changes.turnover_last_m = { old: existing.turnover_last_m ?? null, new: last };
      }
    }
  }

  // отметка «проверено» → сброс needs_review
  if (fd.get('reviewed') === 'on' && existing.needs_review) {
    updates.needs_review = false;
    changes.needs_review = { old: true, new: false };
  }

  if (Object.keys(updates).length > 0) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      params.push(v);
      sets.push(k === 'turnovers' ? `${k} = $${params.length}::jsonb` : `${k} = $${params.length}`);
    }
    params.push(id);
    await sql.query(
      `update companies set ${sets.join(', ')}, updated_at = now() where id = $${params.length}`,
      params,
    );
    await sql`
      insert into company_audit (company_id, actor, changes)
      values (${id}, 'admin', ${JSON.stringify(changes)}::jsonb)
    `;
  }

  revalidatePath(`/admin/companies/${id}`);
  revalidatePath('/admin/companies');
}

/** Удаление = смена статуса на archived (физических delete нет). */
export async function archiveCompany(id: number) {
  const [existing] = await sql`select status from companies where id = ${id}`;
  if (!existing || existing.status === 'archived') return;
  await sql`update companies set status = 'archived', updated_at = now() where id = ${id}`;
  await sql`
    insert into company_audit (company_id, actor, changes)
    values (${id}, 'admin', ${JSON.stringify({ status: { old: existing.status, new: 'archived' } })}::jsonb)
  `;
  revalidatePath(`/admin/companies/${id}`);
  revalidatePath('/admin/companies');
}

const VALID_STATUSES = ['draft', 'verified', 'reserved', 'sold', 'archived'];

/** Массовая смена статуса с записью в аудит (по строке на компанию). */
async function applyBulkStatus(ids: number[], status: string): Promise<number> {
  if (!VALID_STATUSES.includes(status) || ids.length === 0) return 0;

  const rows = await sql`
    select id, status from companies
    where id = any(${ids}) and status <> ${status}
  `;
  if (rows.length === 0) return 0;

  const changedIds = rows.map((r) => Number(r.id));
  const audit = rows.map((r) => ({
    id: Number(r.id),
    changes: { status: { old: r.status, new: status } },
  }));

  await sql.transaction([
    sql`update companies set status = ${status}, updated_at = now() where id = any(${changedIds})`,
    sql`
      insert into company_audit (company_id, actor, changes)
      select (r->>'id')::bigint, 'admin', r->'changes'
      from jsonb_array_elements(${JSON.stringify(audit)}::jsonb) r
    `,
  ]);
  return changedIds.length;
}

/** Смена статуса у отмеченных чекбоксами компаний. */
export async function bulkSetStatus(fd: FormData) {
  const status = String(fd.get('target_status') ?? 'verified');
  const ids = fd.getAll('ids').map(Number).filter((n) => Number.isInteger(n));
  await applyBulkStatus(ids, status);
  revalidatePath('/admin/companies');
}

/** Смена статуса у ВСЕХ компаний под текущим фильтром. */
export async function bulkSetStatusByFilter(fd: FormData) {
  const status = String(fd.get('target_status') ?? 'verified');
  const numValue = (key: string) => {
    const v = formValue(fd, key);
    if (v === null) return undefined;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const filters: CompanyFilters = {
    q: formValue(fd, 'f_q') ?? undefined,
    region: formValue(fd, 'f_region') ?? undefined,
    status: formValue(fd, 'f_status') ?? undefined,
    tax: formValue(fd, 'f_tax') ?? undefined,
    source: formValue(fd, 'f_source') ?? undefined,
    needs_review: fd.get('f_needs_review') === 'true' ? true : undefined,
    turnover_min: numValue('f_turnover_min'),
    turnover_max: numValue('f_turnover_max'),
    price_min: numValue('f_price_min'),
    price_max: numValue('f_price_max'),
  };
  const rows = await queryCompaniesAll(filters);
  const ids = rows.map((r) => Number(r.id));
  await applyBulkStatus(ids, status);
  revalidatePath('/admin/companies');
}

/** Проверка карточки по ЕГРЮЛ (DaData). */
export async function checkEgrul(id: number) {
  const { checkCompanyByInn } = await import('@/lib/dadata/check');
  await checkCompanyByInn(id);
  revalidatePath(`/admin/companies/${id}`);
  revalidatePath('/admin/companies');
}

/** Число из формы: принимает запятую как разделитель, пустое → null. */
function numOrNull(fd: FormData, key: string): number | null {
  const v = formValue(fd, key);
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Собирает обороты по годам из полей turnover_<год> в jsonb {"2024": 82.2}. */
function collectTurnovers(fd: FormData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key] of fd.entries()) {
    const m = key.match(/^turnover_(\d{4})$/);
    if (!m) continue;
    const n = numOrNull(fd, key);
    if (n !== null) out[m[1]] = n;
  }
  return out;
}

/** Быстрое добавление: ИНН + контакт + цены, остальное из ЕГРЮЛ. */
export async function createCompanyQuick(fd: FormData) {
  const { createCompanyFromInn } = await import('@/lib/companies/create-from-inn');
  const inn = formValue(fd, 'inn');
  if (!inn) throw new Error('Укажите ИНН');

  const result = await createCompanyFromInn({
    inn,
    contact: formValue(fd, 'seller_contact'),
    buyPriceK: numOrNull(fd, 'buy_price_k'),
    priceK: numOrNull(fd, 'price_k'),
    extra: formValue(fd, 'extra'),
    actor: 'admin',
  });

  if (!result.ok) {
    if (result.duplicateId) redirect(`/admin/companies/${result.duplicateId}`);
    throw new Error(result.error);
  }
  revalidatePath('/admin/companies');
  redirect(`/admin/companies/${result.id}`);
}

export async function createCompany(fd: FormData) {
  const name = formValue(fd, 'name');
  if (!name) throw new Error('Название обязательно');

  const innRaw = formValue(fd, 'inn');
  const inn = innRaw ? normalizeInn(innRaw).value : null;
  const turnovers = collectTurnovers(fd);
  // оборот последнего года дублируем в turnover_last_m — по нему работают фильтры
  const years = Object.keys(turnovers).sort();
  const lastTurnover = years.length ? turnovers[years[years.length - 1]] : null;

  const [row] = await sql`
    insert into companies (
      name, inn, inn_raw, seller_contact, region_code, year_reg, tax_system,
      buy_price_k, price_k, price_note, turnovers, turnover_last_m,
      address, okved, employees, banks, zska, has_license, extra,
      status, source, needs_review
    ) values (
      ${name}, ${inn}, ${innRaw}, ${formValue(fd, 'seller_contact')},
      ${formValue(fd, 'region_code')}, ${numOrNull(fd, 'year_reg')}, ${formValue(fd, 'tax_system')},
      ${numOrNull(fd, 'buy_price_k')}, ${numOrNull(fd, 'price_k')}, ${formValue(fd, 'price_note')},
      ${JSON.stringify(turnovers)}::jsonb, ${lastTurnover},
      ${formValue(fd, 'address')}, ${formValue(fd, 'okved')}, ${numOrNull(fd, 'employees')},
      ${formValue(fd, 'banks')}, ${formValue(fd, 'zska')}, ${fd.get('has_license') === 'on'},
      ${formValue(fd, 'extra')},
      'draft', 'manual', false
    )
    returning id
  `;
  await sql`
    insert into company_audit (company_id, actor, changes)
    values (${row.id}, 'admin', ${JSON.stringify({ created: { old: null, new: name } })}::jsonb)
  `;
  redirect(`/admin/companies/${row.id}`);
}
