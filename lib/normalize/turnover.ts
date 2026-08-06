import { FieldResult, field, cellToString } from './types';

/**
 * Раздел 4.6. Обороты → turnover_note + turnover_last_m.
 * Полный текст сохраняется как есть; извлекаем оборот последнего упомянутого года
 * по паттерну '<yy> - <число> [млн]' ('23-4млн; 24-12млн' → 12).
 * Ошибки извлечения — не review, поле опциональное.
 */
export function normalizeTurnover(rawValue: unknown): FieldResult<number> {
  const raw = cellToString(rawValue);
  if (raw === null) return field<number>(null, null);

  const re = /(\d{2})\s*[-–]\s*([\d.,]+)\s*(млн)?/g;
  let best: { year: number; value: number } | null = null;
  for (const m of raw.matchAll(re)) {
    const year = Number(m[1]);
    const value = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) continue;
    if (best === null || year > best.year) best = { year, value };
  }

  return field(best ? best.value : null, raw);
}
