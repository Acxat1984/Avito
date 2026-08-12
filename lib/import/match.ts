import { sql } from '@/lib/db/client';
import { NormalizedCompany } from '@/lib/normalize';
import { ParsedRow } from './parse';

export type ImportAction = 'insert' | 'update' | 'skip' | 'conflict';

export interface MatchedRow extends ParsedRow {
  action: ImportAction;
  matchCompanyId: number | null;
  problems: string[];
}

interface ExistingCompany {
  id: number;
  inn: string | null;
  name: string;
  source: string;
  dialog_id: number | null;
  [key: string]: unknown;
}

/** Поля компании, которые обновляет импорт (правило «import never blanks»). */
export const UPDATABLE_FIELDS: (keyof NormalizedCompany)[] = [
  'name', 'inn', 'inn_raw', 'seller_contact',
  'region_code', 'city_raw', 'year_reg', 'year_raw',
  'turnover_note', 'turnover_last_m',
  'price_k', 'price_raw', 'buy_price_k',
  'tax_system', 'tax_raw', 'extra', 'banks',
];

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function sameValue(oldV: unknown, newV: unknown): boolean {
  if (oldV === null || oldV === undefined) return isEmpty(newV);
  // numeric из PG приходит строкой — сравниваем по строковому представлению чисел
  if (typeof newV === 'number') return Number(oldV) === newV;
  return String(oldV) === String(newV);
}

export type Changes = Record<string, { old: unknown; new: unknown }>;

/**
 * Diff для update: менять только НЕПУСТЫЕ новые значения; пустая ячейка Excel
 * не затирает существующее («import never blanks»). has_license — только установка в true.
 */
export function buildUpdateChanges(
  existing: Record<string, unknown>,
  parsed: NormalizedCompany,
): Changes {
  const changes: Changes = {};
  for (const f of UPDATABLE_FIELDS) {
    const newV = parsed[f];
    if (isEmpty(newV)) continue;
    const oldV = existing[f];
    if (sameValue(oldV, newV)) continue;
    changes[f] = { old: oldV ?? null, new: newV as unknown };
  }
  if (parsed.has_license && existing.has_license !== true) {
    changes.has_license = { old: existing.has_license ?? false, new: true };
  }

  // обороты по годам: доливаем новые годы к уже известным, старые не стираем
  const newYears = parsed.turnovers ?? {};
  if (Object.keys(newYears).length > 0) {
    const oldYears = (existing.turnovers ?? {}) as Record<string, number>;
    const merged = { ...oldYears, ...newYears };
    if (JSON.stringify(merged) !== JSON.stringify(oldYears)) {
      changes.turnovers = { old: oldYears, new: merged };
    }
  }
  return changes;
}

/**
 * Раздел 5, фаза 1, шаг 3. Матчинг строк с существующими компаниями:
 * по нормализованному ИНН → update; по lower(trim(name)) → update + пометка;
 * иначе insert. Карточка от бота (source='avito_bot' + dialog_id) → conflict.
 */
export async function matchRows(rows: ParsedRow[]): Promise<MatchedRow[]> {
  const inns = [...new Set(rows.map((r) => r.parsed.inn).filter((v): v is string => !!v))];
  const names = [
    ...new Set(
      rows
        .map((r) => r.parsed.name?.toLowerCase().trim())
        .filter((v): v is string => !!v),
    ),
  ];

  const existing = (await sql`
    select id, inn, name, source, dialog_id,
           inn_raw, seller_contact, region_code, city_raw, year_reg, year_raw,
           turnover_note, turnover_last_m, price_k, price_raw, buy_price_k,
           tax_system, tax_raw, extra, has_license, banks
    from companies
    where (inn = any(${inns}) and inn is not null)
       or lower(trim(name)) = any(${names})
  `) as unknown as ExistingCompany[];

  const byInn = new Map<string, ExistingCompany>();
  const byName = new Map<string, ExistingCompany>();
  for (const c of existing) {
    if (c.inn && !byInn.has(c.inn)) byInn.set(c.inn, c);
    const nameKey = c.name.toLowerCase().trim();
    if (!byName.has(nameKey)) byName.set(nameKey, c);
  }

  return rows.map((row) => {
    const problems = [...row.parsed.problems];

    if (row.empty) {
      return { ...row, action: 'skip' as const, matchCompanyId: null, problems };
    }

    let match: ExistingCompany | undefined;
    if (row.parsed.inn) match = byInn.get(row.parsed.inn);
    if (!match && row.parsed.name) {
      match = byName.get(row.parsed.name.toLowerCase().trim());
      if (match) problems.push('совпадение по имени, ИНН отсутствует');
    }

    if (!match) {
      return { ...row, action: 'insert' as const, matchCompanyId: null, problems };
    }
    // карточку создал бот — слепая перезапись запрещена, решает человек
    if (match.source === 'avito_bot' && match.dialog_id !== null) {
      return { ...row, action: 'conflict' as const, matchCompanyId: match.id, problems };
    }
    return { ...row, action: 'update' as const, matchCompanyId: match.id, problems };
  });
}
