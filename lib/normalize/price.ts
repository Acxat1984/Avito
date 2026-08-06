import { FieldResult, field, cellToString } from './types';

/**
 * Раздел 4.4. Цена → price_k + price_raw. Числа в файле — ТЫСЯЧИ ₽.
 * Извлекаем первое число; 'Дог', пусто, нет числа → null (это норма, не review).
 */
export function normalizePrice(rawValue: unknown): FieldResult<number> {
  const raw = cellToString(rawValue);
  if (raw === null) return field<number>(null, null);

  const m = raw.match(/\d+(?:[.,]\d+)?/);
  if (!m) return field<number>(null, raw);

  const n = Number(m[0].replace(',', '.'));
  if (!Number.isFinite(n)) return field<number>(null, raw);
  return field(n, raw);
}
