import { FieldResult, field, cellToString } from './types';

/**
 * Раздел 4.1. ИНН → inn + inn_raw.
 * - Замена похожих на цифры букв (латинская и кириллическая O/о → 0), затем только \d.
 * - Валидная длина: 10 (юрлицо) или 12 (ИП).
 * - «По запросу» и любые нецифровые → null без review (осознанное «скрыто»).
 */
export function normalizeInn(rawValue: unknown): FieldResult<string> {
  const raw = cellToString(rawValue);
  if (raw === null) return field<string>(null, null);

  // только латинские O/o (спутаны с нулём); кириллические не трогаем — иначе 'По запросу' даст цифры
  const digits = raw.replace(/[Oo]/g, '0').replace(/\D/g, '');

  if (digits.length === 10 || digits.length === 12) {
    return field(digits, raw);
  }
  if (digits.length === 0) {
    // 'По запросу' и прочий текст без цифр — не ошибка, но пометить
    return field<string>(null, raw, ['ИНН по запросу'], false);
  }
  return field<string>(null, raw, ['ИНН нестандартной длины'], true);
}
