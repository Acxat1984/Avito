import { sql } from '@/lib/db/client';
import { findByInn } from '@/lib/dadata/client';
import { normalizeInn, normalizeExtra } from '@/lib/normalize';
import { regionFromKladr } from '@/lib/normalize/regions';

/**
 * Быстрое добавление компании: владелец указывает только ИНН, контакт и цены,
 * остальное (название, год, регион, адрес, ОКВЭД) подтягивается из ЕГРЮЛ.
 * Налоговый режим DaData на текущем тарифе не отдаёт → карточка помечается
 * needs_review, чтобы владелец его дозаполнил.
 */

export interface QuickInput {
  inn: string;
  contact?: string | null;
  buyPriceK?: number | null;
  priceK?: number | null;
  extra?: string | null;
  /** кто добавил — для company_audit */
  actor: string;
}

export type QuickResult =
  | { ok: true; id: number; name: string; egrulStatus: string | null; warnings: string[] }
  | { ok: false; error: string; duplicateId?: number };

export async function createCompanyFromInn(input: QuickInput): Promise<QuickResult> {
  const innField = normalizeInn(input.inn);
  if (!innField.value) {
    return { ok: false, error: 'ИНН должен содержать 10 цифр (юрлицо) или 12 (ИП)' };
  }
  const inn = innField.value;

  const [dup] = await sql`select id, name, status from companies where inn = ${inn}`;
  if (dup) {
    return {
      ok: false,
      error: `Компания с таким ИНН уже есть: «${dup.name}» (№ ${dup.id}, ${dup.status})`,
      duplicateId: Number(dup.id),
    };
  }

  let info: Awaited<ReturnType<typeof findByInn>> = null;
  const warnings: string[] = [];
  try {
    info = await findByInn(inn);
  } catch (e) {
    warnings.push(`ЕГРЮЛ недоступен: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
  }
  if (!info && warnings.length === 0) warnings.push('ИНН не найден в ЕГРЮЛ');

  const addressData = (info?.raw as { data?: { address?: { data?: Record<string, string> } } } | undefined)
    ?.data?.address?.data;
  const regionCode = regionFromKladr(addressData?.region_kladr_id, addressData?.city ?? addressData?.settlement);
  if (info && !regionCode) warnings.push('регион не сопоставлен со справочником — проверьте вручную');

  const extraParsed = normalizeExtra(input.extra ?? null, []);
  const name = info?.shortName ?? info?.name ?? `ИНН ${inn}`;
  const regYear = info?.regDate ? Number(info.regDate.slice(0, 4)) : null;

  // налоговый режим неизвестен → карточку нужно дозаполнить
  warnings.push('уточните налоговый режим и обороты');

  const [row] = await sql`
    insert into companies (
      name, inn, inn_raw, seller_contact,
      region_code, city_raw, year_reg,
      buy_price_k, price_k,
      extra, banks, has_license,
      okved, address,
      -- address оставляем пустым: юр. адрес лежит в egrul_address,
      -- своё поле владелец заполняет вручную («офис», «жилой»)
      egrul_status, egrul_name, egrul_reg_date, egrul_address, egrul_okved, egrul_data, egrul_checked_at,
      status, source, needs_review, review_notes
    ) values (
      ${name}, ${inn}, ${input.inn}, ${input.contact ?? null},
      ${regionCode}, ${addressData?.city ?? addressData?.settlement ?? null}, ${regYear},
      ${input.buyPriceK ?? null}, ${input.priceK ?? null},
      ${extraParsed.extra}, ${extraParsed.banks}, ${extraParsed.has_license},
      ${info?.okved ?? null}, ${null},
      ${info?.status ?? (info === null ? 'NOT_FOUND' : null)}, ${info?.shortName ?? info?.name ?? null},
      ${info?.regDate ?? null}, ${info?.address ?? null}, ${info?.okved ?? null},
      ${info ? JSON.stringify(info.raw) : null}::jsonb, ${info ? new Date().toISOString() : null},
      'draft', 'quick', true, ${warnings.join('; ')}
    )
    returning id
  `;
  const id = Number(row.id);

  await sql`
    insert into company_audit (company_id, actor, changes)
    values (${id}, ${input.actor}, ${JSON.stringify({ created: { old: null, new: `${name} (быстрое добавление по ИНН)` } })}::jsonb)
  `;

  return { ok: true, id, name, egrulStatus: info?.status ?? null, warnings };
}
