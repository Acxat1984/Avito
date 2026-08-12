import { cellToString } from './types';

/**
 * Аббревиатура как отдельное слово. `\b` в JS работает только по латинице,
 * поэтому границы задаём явно — иначе «ПСБ» целиком из кириллицы не найдётся.
 */
function abbr(...variants: string[]): RegExp {
  return new RegExp(`(?<![а-яёa-z0-9])(?:${variants.join('|')})(?![а-яёa-z0-9])`, 'i');
}

/**
 * Известные банки: каноническое имя и варианты написания.
 * Названия ищем по основе слова — продавцы пишут в любом падеже
 * («в Сбере», «на Точке», «через Альфу»).
 */
const BANK_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: 'Сбер', re: /сбер|sber/i },
  { name: 'Альфа', re: /альф[аеуы]|альфа-?банк|alfa/i },
  { name: 'ВТБ', re: abbr('втб', 'vtb') },
  { name: 'Точка', re: /точк[аеиу]/i },
  { name: 'Озон', re: /озон|ozon/i },
  { name: 'ОТП', re: abbr('отп', 'otp') },
  { name: 'Тинькофф', re: /тинькоф|тиньк|т-?банк|tinkoff/i },
  { name: 'Райффайзен', re: /райф|raiff/i },
  { name: 'Модульбанк', re: /модуль/i },
  { name: 'Открытие', re: /открыти[еяю]/i },
  { name: 'Совкомбанк', re: /совком/i },
  { name: 'Газпромбанк', re: /газпромбанк|газпром ?банк|(?<![а-яё])гпб(?![а-яё])/i },
  { name: 'Росбанк', re: /росбанк/i },
  { name: 'МКБ', re: /(?<![а-яёa-z0-9])мкб(?![а-яёa-z0-9])|московский кредитный/i },
  { name: 'Уралсиб', re: /уралсиб/i },
  { name: 'Ак Барс', re: /ак ?барс|акбарс/i },
  { name: 'ПСБ', re: /(?<![а-яёa-z0-9])псб(?![а-яёa-z0-9])|промсвязь/i },
  { name: 'Юникредит', re: /юникредит|unicredit/i },
  { name: 'Локо-банк', re: /локо/i },
  { name: 'Зенит', re: /зенит/i },
  { name: 'Дом.РФ', re: /дом\.? ?рф/i },
  { name: 'Русский Стандарт', re: /русск\S* ?стандарт/i },
  { name: 'Абсолют', re: /абсолют/i },
  { name: 'Экспобанк', re: /экспобанк/i },
  { name: 'СДМ', re: abbr('сдм') },
  { name: 'Веста', re: /вест[аеы]/i },
  { name: 'Бланк', re: /(?<![а-яёa-z0-9])бланк/i },
  { name: 'Синара', re: /синар[аеы]|(?<![а-яёa-z0-9])скб(?![а-яёa-z0-9])/i },
  { name: 'Кубань Кредит', re: /кубань ?кредит/i },
  { name: 'Примсоцбанк', re: /примсоц/i },
  { name: 'Кредит Европа', re: /кредит ?европа/i },
  { name: 'Ренессанс', re: /ренессанс/i },
  { name: 'Хоум', re: /хоум|home ?credit/i },
  { name: 'Металлинвестбанк', re: /металлинвест/i },
  { name: 'Солидарность', re: /солидарност/i },
  { name: 'Форштадт', re: /форштадт/i },
  { name: 'Левобережный', re: /левобережн/i },
  { name: 'Приморье', re: /приморь[ея]/i },
  { name: 'Финам', re: /финам/i },
  { name: 'БКС', re: abbr('бкс') },
  { name: 'Держава', re: /держав[аеы]/i },
  { name: 'Реалист', re: /реалист/i },
  { name: 'Тимер', re: /тимер/i },
  { name: 'Заречье', re: /заречь[ея]/i },
  { name: 'Челябинвест', re: /челябинвест/i },
];

export interface ExtraResult {
  extra: string | null;
  has_license: boolean;
  banks: string | null;
}

/** Ищет известные банки в произвольном тексте. Возвращает 'Сбер, Альфа' или null. */
export function findBanks(text: string | null | undefined): string | null {
  if (!text) return null;
  const found = BANK_TOKENS.filter((b) => b.re.test(text)).map((b) => b.name);
  return found.length ? [...new Set(found)].join(', ') : null;
}

/**
 * Раздел 4.7. «Дополнительно» + хвостовые Unnamed:* → extra, has_license, banks.
 * Отдельная колонка с банками (если она есть в файле) имеет приоритет,
 * но названия всё равно приводятся к каноническим.
 */
export function normalizeExtra(
  main: unknown,
  unnamed: unknown[] = [],
  banksColumn?: unknown,
): ExtraResult {
  const parts = [cellToString(main), ...unnamed.map(cellToString)].filter(
    (p): p is string => p !== null,
  );
  const extra = parts.length ? parts.join('; ') : null;

  const hasLicense = extra !== null && /лиценз/i.test(extra);

  // сначала своя колонка «банки», затем — упоминания в «дополнительно»
  const rawBanks = cellToString(banksColumn);
  const banks = findBanks(rawBanks) ?? rawBanks ?? findBanks(extra);

  return { extra, has_license: hasLicense, banks };
}
