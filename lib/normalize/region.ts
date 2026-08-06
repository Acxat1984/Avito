import { FieldResult, field, cellToString } from './types';
import { REGION_SYNONYMS } from './regions';

/**
 * Раздел 4.3. Город → region_code + city_raw.
 * lower + trim + схлопнуть пробелы, затем точное совпадение по справочнику синонимов.
 */
export function normalizeRegion(rawValue: unknown): FieldResult<string> {
  const raw = cellToString(rawValue);
  if (raw === null) return field<string>(null, null);

  const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const code = REGION_SYNONYMS[key];
  if (code) return field(code, raw);

  return field<string>(null, raw, [`город не распознан: ${raw}`], true);
}
