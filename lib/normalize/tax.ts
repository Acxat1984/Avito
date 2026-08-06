import { FieldResult, field, cellToString } from './types';

export type TaxSystem = 'osno' | 'usn6' | 'usn_dr' | 'ausn';

/**
 * Раздел 4.5. Налоговый режим → tax_system + tax_raw.
 * Скобочные оговорки уходят в problems (review_notes), режим — по основному токену.
 */
export function normalizeTax(rawValue: unknown): FieldResult<TaxSystem> {
  const raw = cellToString(rawValue);
  if (raw === null) return field<TaxSystem>(null, null);

  const problems: string[] = [];
  let s = raw.toLowerCase().trim();

  // скобочные оговорки: 'усн (хотят на осно)', 'усн (с нг на ндс)'
  s = s
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => {
      const note = inner.trim();
      if (note) problems.push(`оговорка по налогу: ${note}`);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (s.includes('осно')) return field<TaxSystem>('osno', raw, problems);
  if (s.includes('аусн')) return field<TaxSystem>('ausn', raw, problems);

  if (s.includes('усн')) {
    if (/д\s*-\s*р|д\s+р|доход\s*-\s*расход/.test(s)) {
      return field<TaxSystem>('usn_dr', raw, problems);
    }
    if (s.includes('6') || s.includes('доход')) {
      return field<TaxSystem>('usn6', raw, problems);
    }
    problems.push('УСН без уточнения, принят 6%');
    return field<TaxSystem>('usn6', raw, problems);
  }

  // чисто числовые/краткие обозначения
  const compact = s.replace(',', '.');
  if (compact === '0.06' || compact === '6') return field<TaxSystem>('usn6', raw, problems);
  if (compact === '0.15' || compact === 'д-р') return field<TaxSystem>('usn_dr', raw, problems);

  problems.push(`налоговый режим не распознан: ${raw}`);
  return field<TaxSystem>(null, raw, problems, true);
}
