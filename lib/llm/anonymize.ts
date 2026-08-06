/**
 * Обезличивание текста перед отправкой в LLM (OpenRouter).
 * Персональные данные (телефоны, email, ссылки/handles, ИНН) заменяются
 * плейсхолдерами [PHONE_1], [INN_1]...; реальные значения остаются только
 * в нашей БД. После ответа LLM плейсхолдеры в extracted подставляются обратно.
 */

const PATTERNS: Array<{ label: string; re: RegExp }> = [
  // телефоны РФ: +7/8/7 + 10 цифр с любыми разделителями — до ИНН, чтобы
  // 11-значные номера не попали под шаблон ИНН
  { label: 'PHONE', re: /(?:\+7|\b[78])[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g },
  { label: 'EMAIL', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { label: 'LINK', re: /(?:https?:\/\/|www\.|t\.me\/)\S+/gi },
  { label: 'HANDLE', re: /@[a-z0-9_]{4,}/gi },
  // ИНН: 10 (юрлицо) или 12 (ИП — персональные данные) цифр
  { label: 'INN', re: /\b\d{12}\b|\b\d{10}\b/g },
];

export class Anonymizer {
  /** плейсхолдер → оригинал */
  readonly map: Record<string, string> = {};
  private counters: Record<string, number> = {};

  /** Замаскировать текст. Одинаковые значения получают один плейсхолдер. */
  mask(text: string): string {
    let out = text;
    for (const { label, re } of PATTERNS) {
      out = out.replace(re, (m) => {
        const existing = Object.entries(this.map).find(([, v]) => v === m);
        if (existing) return existing[0];
        this.counters[label] = (this.counters[label] ?? 0) + 1;
        const token = `[${label}_${this.counters[label]}]`;
        this.map[token] = m;
        return token;
      });
    }
    return out;
  }

  /** Вернуть оригиналы вместо плейсхолдеров во всех строках объекта. */
  unmaskDeep<T>(value: T): T {
    if (typeof value === 'string') {
      let s: string = value;
      for (const [token, original] of Object.entries(this.map)) {
        s = s.split(token).join(original);
      }
      return s as T;
    }
    if (Array.isArray(value)) return value.map((v) => this.unmaskDeep(v)) as T;
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.unmaskDeep(v);
      return out as T;
    }
    return value;
  }

  get maskedCount(): number {
    return Object.keys(this.map).length;
  }
}
