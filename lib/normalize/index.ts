export { normalizeInn } from './inn';
export { normalizeYear } from './year';
export { normalizeRegion } from './region';
export { normalizePrice } from './price';
export { normalizeTax } from './tax';
export { normalizeTurnover } from './turnover';
export { normalizeExtra } from './extra';
export { REGION_SYNONYMS, REGION_NAMES, regionName, regionFromText } from './regions';
export { cellToString } from './types';
export type { FieldResult } from './types';
export type { TaxSystem } from './tax';

import { normalizeInn } from './inn';
import { normalizeYear } from './year';
import { normalizeRegion } from './region';
import { normalizePrice } from './price';
import { normalizeTax } from './tax';
import { normalizeTurnover } from './turnover';
import { normalizeExtra } from './extra';
import { cellToString } from './types';

/** Нормализованная карточка компании — общий формат для импорта И бота (раздел 8.1). */
export interface NormalizedCompany {
  name: string | null;
  inn: string | null;
  inn_raw: string | null;
  seller_contact: string | null;
  region_code: string | null;
  city_raw: string | null;
  year_reg: number | null;
  year_raw: string | null;
  turnover_note: string | null;
  turnover_last_m: number | null;
  price_k: number | null;
  price_raw: string | null;
  buy_price_k: number | null;
  tax_system: string | null;
  tax_raw: string | null;
  extra: string | null;
  has_license: boolean;
  banks: string | null;
  needs_review: boolean;
  problems: string[];
}

export interface RawCompanyInput {
  name?: unknown;
  inn?: unknown;
  seller_contact?: unknown;
  turnover?: unknown;
  buy_price?: unknown;
  price?: unknown;
  tax?: unknown;
  city?: unknown;
  year?: unknown;
  extra?: unknown;
  /** хвостовые Unnamed:* колонки */
  unnamed?: unknown[];
}

/**
 * Прогоняет сырую строку (из Excel или из extracted бота) через все правила раздела 4.
 */
export function normalizeCompany(input: RawCompanyInput): NormalizedCompany {
  const problems: string[] = [];
  let needsReview = false;

  const inn = normalizeInn(input.inn);
  const year = normalizeYear(input.year);
  const region = normalizeRegion(input.city);
  const price = normalizePrice(input.price);
  const buyPrice = normalizePrice(input.buy_price);
  const tax = normalizeTax(input.tax);
  const turnover = normalizeTurnover(input.turnover);
  const extra = normalizeExtra(input.extra, input.unnamed ?? []);

  for (const f of [inn, year, region, price, buyPrice, tax, turnover]) {
    problems.push(...f.problems);
    if (f.needsReview) needsReview = true;
  }

  return {
    name: cellToString(input.name),
    inn: inn.value,
    inn_raw: inn.raw,
    seller_contact: cellToString(input.seller_contact),
    region_code: region.value,
    city_raw: region.raw,
    year_reg: year.value,
    year_raw: year.raw,
    turnover_note: turnover.raw,
    turnover_last_m: turnover.value,
    price_k: price.value,
    price_raw: price.raw,
    buy_price_k: buyPrice.value,
    tax_system: tax.value,
    tax_raw: tax.raw,
    extra: extra.extra,
    has_license: extra.has_license,
    banks: extra.banks,
    needs_review: needsReview,
    problems,
  };
}
