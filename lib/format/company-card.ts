import { regionName } from '@/lib/normalize/regions';

/**
 * Карточки компании для Telegram-бота: полная (владельцу) и партнёрская.
 * ВНИМАНИЕ: содержат название, ИНН и цену — в Avito такие данные отправлять
 * нельзя (INV-4), там подбор собирается формате formatOffers.
 */

const TAX_NAMES: Record<string, string> = {
  osno: 'ОСНО',
  usn6: 'УСН 6%',
  usn_dr: 'УСН доходы-расходы',
  ausn: 'АУСН',
};

export interface CompanyLike {
  id: number | string;
  name: string;
  inn?: string | null;
  inn_raw?: string | null;
  year_reg?: number | null;
  tax_system?: string | null;
  tax_raw?: string | null;
  region_code?: string | null;
  city_raw?: string | null;
  address?: string | null;
  egrul_address?: string | null;
  okved?: string | null;
  egrul_okved?: string | null;
  employees?: number | null;
  banks?: string | null;
  turnovers?: Record<string, number | string> | null;
  turnover_note?: string | null;
  zska?: string | null;
  price_k?: number | string | null;
  price_raw?: string | null;
  price_note?: string | null;
  buy_price_k?: number | string | null;
  extra?: string | null;
}

/**
 * Оборот за последний ЗАВЕРШЁННЫЙ год. Текущий год не берём: он неполный и
 * занижает картину (фирма с 33 млн за 2024 выглядела бы как 0,5 млн за 2026).
 * Если завершённых лет нет — отдаём максимальное известное значение.
 */
export function lastFullYearTurnover(
  t: Record<string, number | string> | null | undefined,
  now = new Date(),
): { year: string; value: number } | null {
  if (!t) return null;
  const entries = Object.entries(t)
    .filter(([y, v]) => /^\d{4}$/.test(y) && v !== null && v !== '' && Number(v) > 0)
    .map(([y, v]) => ({ year: y, value: Number(v) }))
    .filter((e) => Number.isFinite(e.value));
  if (entries.length === 0) return null;

  const currentYear = now.getFullYear();
  const finished = entries.filter((e) => Number(e.year) < currentYear);
  const pool = finished.length > 0 ? finished : entries;
  return pool.reduce((a, b) => (Number(a.year) >= Number(b.year) ? a : b));
}

/** «22,5» вместо «22.5» — привычный десятичный разделитель. */
export function ru(n: number): string {
  return String(n).replace('.', ',');
}

/** Обороты по годам, отсортированные по возрастанию года. */
export function turnoverLines(t: Record<string, number | string> | null | undefined): string[] {
  if (!t) return [];
  return Object.entries(t)
    .filter(([year, v]) => /^\d{4}$/.test(year) && v !== null && v !== '')
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, v]) => `${year} год - ${String(v).replace('.', ',')} млн`);
}

function priceText(c: CompanyLike): string | null {
  if (c.price_k !== null && c.price_k !== undefined && c.price_k !== '') {
    const n = Number(c.price_k);
    const base = Number.isFinite(n) ? String(n).replace('.', ',') : String(c.price_k);
    return c.price_note ? `${base} + ${c.price_note}` : base;
  }
  return c.price_raw ?? null;
}

/**
 * Карточка для пользователя бота, который не является владельцем
 * (партнёр, гость). Белый список полей: название, адрес, расчётный счёт,
 * обороты, налоговый режим, год создания и цена продажи.
 * НЕ содержит: ИНН, контакт продавца, цену закупа, ЗСКА и «дополнительно»
 * (там бывают долги и причина продажи).
 */
export function formatPartnerCard(c: CompanyLike): string {
  const lines: string[] = [`✅ ${c.name}`];
  const add = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`✅ ${label}: ${value}`);
  };

  add('Год создания', c.year_reg ? `${c.year_reg} год` : null);
  add('Налогообложение', c.tax_system ? TAX_NAMES[c.tax_system] ?? c.tax_system : c.tax_raw);

  const place = c.address
    ? [regionName(c.region_code) ?? c.city_raw, c.address].filter(Boolean).join(', ')
    : (c.egrul_address ?? regionName(c.region_code) ?? c.city_raw ?? null);
  add('Адрес', place);

  add('Р/С', c.banks);

  const turns = turnoverLines(c.turnovers);
  if (turns.length > 0) {
    lines.push('✅ Обороты:');
    lines.push(...turns);
  } else if (c.turnover_note) {
    add('Обороты', c.turnover_note);
  }

  // цену числом сопровождаем единицей, свободный текст («Дог») оставляем как есть
  const hasNumericPrice = c.price_k !== null && c.price_k !== undefined && c.price_k !== '';
  const price = priceText(c);
  add('Цена', price ? (hasNumericPrice ? `${price} тыс ₽` : price) : 'обсуждается');
  lines.push(`✅ Номер в базе: ${c.id}`);

  return lines.join('\n');
}

/**
 * Формат выдачи владельцу (Telegram). Пустые поля пропускаются,
 * чтобы карточка не пестрела прочерками.
 */
export function formatCompanyCard(c: CompanyLike, opts: { showBuyPrice?: boolean } = {}): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`✅ ${label}: ${value}`);
  };

  lines.push(`✅ ${c.name}`);
  add('ИНН', c.inn ?? c.inn_raw);
  add('Создание', c.year_reg ? `${c.year_reg} год` : null);
  add('Налогообложение', c.tax_system ? TAX_NAMES[c.tax_system] ?? c.tax_system : c.tax_raw);

  // свой адрес показываем с регионом; юр. адрес из ЕГРЮЛ уже содержит город —
  // префикс региона к нему не добавляем, чтобы не было «Пенза, г Пенза, …»
  const place = c.address
    ? [regionName(c.region_code) ?? c.city_raw, c.address].filter(Boolean).join(', ')
    : (c.egrul_address ?? regionName(c.region_code) ?? c.city_raw ?? null);
  add('Адрес', place);

  add('Оквэд', c.okved ?? c.egrul_okved);
  add('Сотрудники', c.employees);
  add('Р/С', c.banks);

  const turns = turnoverLines(c.turnovers);
  if (turns.length > 0) {
    lines.push('✅ Обороты:');
    lines.push(...turns);
  } else if (c.turnover_note) {
    add('Обороты', c.turnover_note);
  }

  add('ЗСКА', c.zska);
  add('Цена', priceText(c));
  if (opts.showBuyPrice) add('Цена закупа', c.buy_price_k);
  // «дополнительно» часто содержит только банки — не дублируем строку Р/С
  const extraIsBanks =
    c.extra && c.banks && c.extra.toLowerCase().replace(/[\s,]/g, '') === c.banks.toLowerCase().replace(/[\s,]/g, '');
  if (!extraIsBanks) add('Дополнительно', c.extra);
  lines.push(`✅ Номер в базе: ${c.id}`);

  return lines.join('\n');
}
