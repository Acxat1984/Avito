import { FieldResult, field, cellToString } from './types';

/**
 * Раздел 4.6. Обороты → turnover_note + разбивка по годам + turnover_last_m.
 *
 * Полный текст сохраняется как есть, а числа раскладываются по годам:
 * '23-4млн; 24-12млн' → {2023: 4, 2024: 12}. Поддерживаются двузначные и
 * четырёхзначные годы, разные разделители и порядок «год — сумма».
 * Ошибки извлечения — не review, поле опциональное.
 */

export interface TurnoverResult extends FieldResult<number> {
  /** обороты по годам в млн: {"2023": 92, "2024": 82.2} */
  byYear: Record<string, number>;
}

const MIN_YEAR = 2000;
const MAX_YEAR = new Date().getFullYear() + 1;

/** '23' → 2023, '2024' → 2024, мусор → null. */
function toYear(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  const year = raw.length <= 2 ? 2000 + n : n;
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

/**
 * Пары «год → сумма». Ищем год, за ним (через разделитель или пробел)
 * число. Само число не должно выглядеть как год — иначе диапазон
 * «2023-2024» превратился бы в оборот.
 */
// Год отделён от соседних цифр: иначе из «2026: минимальные» движок
// откатился бы к году «20» и обороту «26».
// После единицы измерения нет \b: она кириллическая, а \b в JS работает
// только по латинице — граница «млрд|конец строки» не срабатывала бы.
const PAIR_RE =
  /(?<!\d)(\d{4}|\d{2})(?!\d)\s*(?:г\.?|год[ауе]?)?\s*[-–—:=~]?\s*(?:на|около|~)?\s*(\d+(?:[.,]\d+)?)\s*(млрд|млн|тыс\.?|т\.?р\.?)?/gi;

/** Разбор одного совпадения: null, если это не «год — сумма». */
function pairFrom(m: RegExpMatchArray): { year: number; value: number } | null {
  const year = toYear(m[1]);
  if (year === null) return null;

  const unit = (m[3] ?? '').toLowerCase();
  let value = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;

  // без явной единицы число, похожее на год, — это второй год диапазона
  if (!unit && Number.isInteger(value) && value >= 1900 && value <= 2100) return null;

  // приводим к миллионам
  if (unit === 'млрд') value *= 1000;
  else if (unit.startsWith('тыс') || unit.startsWith('т.') || unit === 'тр') value /= 1000;

  return { year, value };
}

export function parseTurnoversByYear(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(PAIR_RE)) {
    const pair = pairFrom(m);
    if (!pair) continue;
    // если год встретился дважды, берём большее значение
    const key = String(pair.year);
    if (out[key] === undefined || pair.value > out[key]) out[key] = pair.value;
  }
  return out;
}

/**
 * То же самое, плюс текст без распознанных оборотов — чтобы не дублировать
 * их в «дополнительно». Слова-связки вроде «оборот за» тоже убираются,
 * если после выреза от них ничего не осталось.
 */
export function extractTurnovers(text: string): {
  byYear: Record<string, number>;
  rest: string | null;
} {
  const byYear = parseTurnoversByYear(text);
  if (Object.keys(byYear).length === 0) return { byYear, rest: text.trim() || null };

  const rest = text
    .replace(PAIR_RE, (match, ...groups) => {
      const m = [match, groups[0], groups[1], groups[2]] as unknown as RegExpMatchArray;
      return pairFrom(m) ? '' : match;
    })
    // «оборот за ;;» → пусто; чистим осиротевшие связки и разделители
    .replace(/оборот[а-я]*(\s+(за|в|по))?\s*[:\-–—]?\s*(?=[;,.\s]|$)/gi, '')
    .replace(/\s+([;,.])/g, '$1')
    .replace(/[;,]\s*(?=[;,])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s;,.\-–—]+|[\s;,.\-–—]+$/g, '')
    .trim();

  return { byYear, rest: rest || null };
}

export function normalizeTurnover(rawValue: unknown): TurnoverResult {
  const raw = cellToString(rawValue);
  if (raw === null) return { ...field<number>(null, null), byYear: {} };

  const byYear = parseTurnoversByYear(raw);
  const years = Object.keys(byYear).sort();
  const last = years.length ? byYear[years[years.length - 1]] : null;

  return { ...field(last, raw), byYear };
}
