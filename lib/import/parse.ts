import * as XLSX from 'xlsx';
import { normalizeCompany, NormalizedCompany, cellToString } from '@/lib/normalize';

export interface ParsedRow {
  rowNum: number;
  /** исходная строка как есть (значения приведены к строкам/числам для jsonb) */
  raw: Record<string, unknown>;
  parsed: NormalizedCompany;
  /** пустая строка: нет ни имени, ни ИНН */
  empty: boolean;
}

export interface ParseResult {
  ok: true;
  rows: ParsedRow[];
}

export interface ParseError {
  ok: false;
  error: string;
  foundColumns: string[];
}

/** Поиск заголовка по включению, регистронезависимо. */
function findHeader(
  headers: string[],
  include: string,
  exclude?: string,
): string | null {
  for (const h of headers) {
    const l = h.toLowerCase();
    if (l.includes(include) && (!exclude || !l.includes(exclude))) return h;
  }
  return null;
}

/** jsonb-безопасное значение ячейки. */
function jsonSafe(v: unknown): unknown {
  if (v instanceof Date) return cellToString(v);
  return v ?? null;
}

/**
 * Раздел 5, фаза 1. Читает первый лист .xlsx, валидирует колонки,
 * прогоняет каждую строку через нормализацию раздела 4.
 */
export function parseWorkbook(buf: ArrayBuffer | Uint8Array): ParseResult | ParseError {
  const wb = XLSX.read(buf instanceof Uint8Array ? buf : new Uint8Array(buf), {
    type: 'array',
    cellDates: true,
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: 'Файл не содержит листов', foundColumns: [] };

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  const headers = rows.length
    ? Object.keys(rows[0])
    : (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []).map(String);

  // обязательные колонки: 'название и инн' и 'инн' (по включению, регистронезависимо)
  const nameCol = findHeader(headers, 'название');
  const innCol = findHeader(headers, 'инн', 'название');
  if (!nameCol || !innCol) {
    return {
      ok: false,
      error: `Не найдены обязательные колонки 'название и инн' и/или 'инн'`,
      foundColumns: headers,
    };
  }

  const sellerCol = findHeader(headers, 'продавец');
  const turnoverCol = findHeader(headers, 'оборот');
  const buyPriceCol = findHeader(headers, 'закуп');
  const priceCol = findHeader(headers, 'цена', 'закуп');
  const taxCol = findHeader(headers, 'налог');
  const cityCol = findHeader(headers, 'город');
  const yearCol = findHeader(headers, 'год', 'город');
  const extraCol = findHeader(headers, 'дополнит');
  const banksCol = findHeader(headers, 'банк') ?? findHeader(headers, 'р/с') ?? findHeader(headers, 'счёт');
  const unnamedCols = headers.filter(
    (h) => /^unnamed/i.test(h) || /^__empty/i.test(h),
  );

  const out: ParsedRow[] = [];
  rows.forEach((row, i) => {
    const parsed = normalizeCompany({
      name: row[nameCol],
      inn: row[innCol],
      seller_contact: sellerCol ? row[sellerCol] : null,
      turnover: turnoverCol ? row[turnoverCol] : null,
      buy_price: buyPriceCol ? row[buyPriceCol] : null,
      price: priceCol ? row[priceCol] : null,
      tax: taxCol ? row[taxCol] : null,
      city: cityCol ? row[cityCol] : null,
      year: yearCol ? row[yearCol] : null,
      extra: extraCol ? row[extraCol] : null,
      banks: banksCol ? row[banksCol] : null,
      unnamed: unnamedCols.map((c) => row[c]),
    });

    const raw: Record<string, unknown> = {};
    for (const h of headers) raw[h] = jsonSafe(row[h]);

    out.push({
      rowNum: i + 2, // +1 заголовок, +1 нумерация с 1 — как в Excel
      raw,
      parsed,
      empty: parsed.name === null && parsed.inn === null && parsed.inn_raw === null,
    });
  });

  return { ok: true, rows: out };
}
