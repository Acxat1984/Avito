import { FieldResult, field, cellToString } from './types';

const MIN_YEAR = 1990;
const MAX_YEAR = 2026;

function inRange(y: number): boolean {
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

/** Двухзначный год → полный: 0–26 → 20xx, 90–99 → 19xx, иначе null. */
function expandTwoDigit(n: number): number | null {
  if (n >= 0 && n <= 26) return 2000 + n;
  if (n >= 90 && n <= 99) return 1900 + n;
  return null;
}

/**
 * Раздел 4.2. Год регистрации → year_reg + year_raw.
 * Порядок попыток: Excel-дата/ISO → dd.mm.yy(г)/mm.yy → 4-значное 1990–2026 → 1–2-значное.
 */
export function normalizeYear(rawValue: unknown): FieldResult<number> {
  // Excel-дата, прочитанная SheetJS как Date
  if (rawValue instanceof Date) {
    const y = rawValue.getFullYear();
    const raw = cellToString(rawValue);
    return inRange(y)
      ? field(y, raw)
      : field<number>(null, raw, [`год вне диапазона: ${y}`], true);
  }

  const raw = cellToString(rawValue);
  if (raw === null) return field<number>(null, null);

  // 1. ISO / Excel-datetime: '2021-09-27 00:00:00', '2021-09-27'
  const iso = raw.match(/^(\d{4})-\d{1,2}-\d{1,2}/);
  if (iso) {
    const y = Number(iso[1]);
    if (inRange(y)) return field(y, raw);
    return field<number>(null, raw, [`год вне диапазона: ${y}`], true);
  }

  // Хвостовые 'г'/'г.' отбрасываем до парсинга
  const s = raw.replace(/\s*г\.?\s*$/iu, '').trim();

  // 2. dd.mm.yyyy / dd.mm.yy / mm.yy — берём последнюю группу как год
  const dotted = s.match(/^(?:\d{1,2}\.)?\d{1,2}\.(\d{2}|\d{4})$/);
  if (dotted) {
    const part = dotted[1];
    const y = part.length === 4 ? Number(part) : expandTwoDigit(Number(part));
    if (y !== null && inRange(y)) return field(y, raw);
    return field<number>(null, raw, [`год не распарсился: ${raw}`], true);
  }

  // 3. Чистое 4-значное число 1990–2026
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    if (inRange(y)) return field(y, raw);
    return field<number>(null, raw, [`год вне диапазона: ${raw}`], true);
  }

  // 4. 1–2-значное число: 5→2005, 22→2022
  if (/^\d{1,2}$/.test(s)) {
    const y = expandTwoDigit(Number(s));
    if (y !== null && inRange(y)) return field(y, raw);
    return field<number>(null, raw, [`год не распарсился: ${raw}`], true);
  }

  return field<number>(null, raw, [`год не распарсился: ${raw}`], true);
}
