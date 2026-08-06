import { cellToString } from './types';

/** Известные банки: канонические имена и варианты написания. */
const BANK_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: 'сбер', re: /сбер/i },
  { name: 'альфа', re: /альфа/i },
  { name: 'втб', re: /втб/i },
  { name: 'точка', re: /точка/i },
  { name: 'озон', re: /озон/i },
  { name: 'отп', re: /отп/i },
  { name: 'тинькофф', re: /тинькоф|т-банк/i },
  { name: 'райф', re: /райф/i },
];

export interface ExtraResult {
  extra: string | null;
  has_license: boolean;
  banks: string | null;
}

/**
 * Раздел 4.7. «Дополнительно» + хвостовые Unnamed:* → extra, has_license, banks.
 */
export function normalizeExtra(main: unknown, unnamed: unknown[] = []): ExtraResult {
  const parts = [cellToString(main), ...unnamed.map(cellToString)].filter(
    (p): p is string => p !== null,
  );
  const extra = parts.length ? parts.join('; ') : null;

  const hasLicense = extra !== null && /лиценз/i.test(extra);

  let banks: string | null = null;
  if (extra !== null) {
    const found = BANK_TOKENS.filter((b) => b.re.test(extra)).map((b) => b.name);
    banks = found.length ? found.join(', ') : null;
  }

  return { extra, has_license: hasLicense, banks };
}
