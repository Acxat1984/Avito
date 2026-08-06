/** Результат нормализации одного поля. */
export interface FieldResult<T> {
  value: T | null;
  raw: string | null;
  /** Заметки для review_notes / import_rows.problems */
  problems: string[];
  /** Требует ручной проверки в админке */
  needsReview: boolean;
}

export function field<T>(
  value: T | null,
  raw: string | null,
  problems: string[] = [],
  needsReview = false,
): FieldResult<T> {
  return { value, raw, problems, needsReview };
}

/** Приведение сырого значения ячейки к строке (или null). */
export function cellToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  const s = String(v).trim();
  return s === '' ? null : s;
}
