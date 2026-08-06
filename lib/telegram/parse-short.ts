/**
 * Разбор краткого формата добавления компании в Telegram.
 * Понимает свободный текст: ИНН, телефон, цены с ключевыми словами, остальное — в доп.
 *
 * Примеры:
 *   7328108216 89278250111 закуп 20 цена 100 альфа, офис
 *   ИНН 7328108216
 *   тел +7 927 825-01-11
 *   закуп 20, продажа 100
 *   Альфа, есть долг 64тр
 */

export interface ShortInput {
  inn: string | null;
  contact: string | null;
  buyPriceK: number | null;
  priceK: number | null;
  extra: string | null;
}

const num = (s: string): number | null => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function parseShortInput(text: string): ShortInput {
  let rest = text;
  const cut = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], ' ');
    return m;
  };

  // цены — с ключевым словом, иначе не отличить от прочих чисел
  const buy = cut(/(?:закуп[а-я]*|покуп[а-я]*)\s*[:\-—]?\s*([\d\s.,]+)/i);
  const sell = cut(/(?:цена\s*продажи|продажа|цена|прода[её]м)\s*[:\-—]?\s*([\d\s.,]+)/i);

  // телефон: 11 цифр с +7/8 или разделителями
  const phone = cut(/(?:\+7|\b8|\b7)[\s(\-]*\d{3}[\s)\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b/);

  // ИНН: 10 или 12 цифр подряд (после вырезания телефона — не спутается)
  const innMatch = cut(/(?:инн\s*[:\-]?\s*)?\b(\d{12}|\d{10})\b/i);

  // всё остальное — доп. информация
  const extra = rest
    .replace(/^[\s,;:.\-—]+|[\s,;:.\-—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:^|\s)(?:инн|тел(?:ефон)?|доп(?:олнительно)?)\s*[:\-]?\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    inn: innMatch ? (innMatch[1] ?? innMatch[0]).replace(/\D/g, '') : null,
    contact: phone ? phone[0].trim() : null,
    buyPriceK: buy ? num(buy[1]) : null,
    priceK: sell ? num(sell[1]) : null,
    extra: extra.length > 1 ? extra : null,
  };
}
