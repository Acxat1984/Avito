import { sql } from './client';

export interface CompanyFilters {
  q?: string;          // поиск по id/name/inn
  region?: string;
  status?: string;
  tax?: string;
  source?: string;
  needs_review?: boolean;
  /** обороты последнего года, млн ₽ */
  turnover_min?: number;
  turnover_max?: number;
  /** цена продажи, тыс ₽ */
  price_min?: number;
  price_max?: number;
}

/** Общий WHERE для таблицы админки и экспорта (раздел 6: те же фильтры). */
function buildWhere(f: CompanyFilters): { text: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (cond: string, value: unknown) => {
    params.push(value);
    conds.push(cond.replace('?', `$${params.length}`));
  };

  if (f.q) {
    // поиск понимает ID карточки («223», «#223», «№ 223») — по нему идёт вся
    // коммуникация с клиентом, поэтому он в приоритете
    const idMatch = f.q.trim().match(/^[#№]?\s*(\d{1,9})$/);
    params.push(`%${f.q}%`);
    const likeIdx = params.length;
    if (idMatch) {
      params.push(Number(idMatch[1]));
      conds.push(
        `(id = $${params.length} or name ilike $${likeIdx} or inn like $${likeIdx})`,
      );
    } else {
      conds.push(`(name ilike $${likeIdx} or inn like $${likeIdx})`);
    }
  }
  if (f.region) add('region_code = ?', f.region);
  if (f.status) add('status = ?', f.status);
  if (f.tax) add('tax_system = ?', f.tax);
  if (f.source) add('source = ?', f.source);
  if (f.needs_review !== undefined) add('needs_review = ?', f.needs_review);
  // карточки без оборотов под фильтр не попадают — это осознанно:
  // владелец ищет фирмы с подтверждёнными оборотами
  if (f.turnover_min !== undefined) add('turnover_last_m >= ?', f.turnover_min);
  if (f.turnover_max !== undefined) add('turnover_last_m <= ?', f.turnover_max);
  // «Дог» (цена не указана) под фильтр по цене не попадает
  if (f.price_min !== undefined) add('price_k >= ?', f.price_min);
  if (f.price_max !== undefined) add('price_k <= ?', f.price_max);

  return {
    text: conds.length ? `where ${conds.join(' and ')}` : '',
    params,
  };
}

export async function queryCompanies(
  f: CompanyFilters,
  limit = 50,
  offset = 0,
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const { text, params } = buildWhere(f);
  const rows = await sql.query(
    `select * from companies ${text} order by updated_at desc limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset],
  );
  const cnt = await sql.query(`select count(*)::int as n from companies ${text}`, params);
  return {
    rows: rows as unknown as Record<string, unknown>[],
    total: (cnt as unknown as { n: number }[])[0].n,
  };
}

/** Все строки под фильтром — для экспорта. */
export async function queryCompaniesAll(f: CompanyFilters): Promise<Record<string, unknown>[]> {
  const { text, params } = buildWhere(f);
  return (await sql.query(
    `select * from companies ${text} order by id`,
    params,
  )) as unknown as Record<string, unknown>[];
}

export function filtersFromSearchParams(sp: Record<string, string | string[] | undefined>): CompanyFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const num = (v: string | string[] | undefined) => {
    const s = one(v);
    if (s === undefined) return undefined;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const nr = one(sp.needs_review);
  return {
    q: one(sp.q),
    region: one(sp.region),
    status: one(sp.status),
    tax: one(sp.tax),
    source: one(sp.source),
    needs_review: nr === undefined ? undefined : nr === 'true' || nr === '1',
    turnover_min: num(sp.turnover_min),
    turnover_max: num(sp.turnover_max),
    price_min: num(sp.price_min),
    price_max: num(sp.price_max),
  };
}
