import { regionName } from '@/lib/normalize/regions';
import { SELLER_QUESTIONS, BUYER_QUESTIONS } from '@/lib/llm/prompts';

/**
 * Все тексты клиенту — ШАБЛОНЫ В КОДЕ (не LLM). Это гарантия INV-2 и INV-4.
 */

export const TEMPLATES = {
  askSeller:
    `Здравствуйте! Подскажите, пожалуйста, по вашей компании — ответьте, по возможности, одним сообщением:\n\n${SELLER_QUESTIONS}\n\nПосле этого передам вас специалисту.`,
  askBuyer:
    `Здравствуйте! Чтобы подобрать варианты, ответьте, пожалуйста, одним сообщением:\n\n${BUYER_QUESTIONS}\n\nПосле этого передам вас специалисту.`,
  escalated:
    'Спасибо! Передаю информацию специалисту — он свяжется с вами в этом чате и ответит на все вопросы, включая цену и детали.',
  escalatedNoData:
    'Передаю ваш вопрос специалисту — он свяжется с вами в этом чате.',
  rejected:
    'Спасибо за обращение! К сожалению, по указанным параметрам сейчас ничем помочь не сможем. Хорошего дня!',
} as const;

const TAX_NAMES: Record<string, string> = {
  osno: 'ОСНО',
  usn6: 'УСН 6%',
  usn_dr: 'УСН доходы-расходы',
  ausn: 'АУСН',
};

/** Белый список полей для выдачи покупателю (INV-4). */
export interface OfferCard {
  region_code: string | null;
  year_reg: number | null;
  tax_system: string | null;
  turnover_last_m: number | string | null;
}

/**
 * Обезличенная выдача подбора (раздел 8.2): только регион текстом, год,
 * налоговый режим, оборот примерно, «цена обсуждается». Никаких имён,
 * ИНН, цен числом, контактов.
 */
export function formatOffers(cards: OfferCard[]): string {
  const lines = cards.map((c) => {
    const parts: string[] = [];
    parts.push(regionName(c.region_code) ?? 'регион уточним');
    if (c.year_reg) parts.push(`регистрация ${c.year_reg} г.`);
    if (c.tax_system) parts.push(TAX_NAMES[c.tax_system] ?? c.tax_system);
    if (c.turnover_last_m != null) parts.push(`обороты ~${Number(c.turnover_last_m)} млн/год`);
    parts.push('цена обсуждается');
    return `— ${parts.join(', ')}`;
  });
  return `Есть подходящие варианты:\n${lines.join('\n')}\n\nДетали и цену обсудите со специалистом — передаю ему диалог, он ответит здесь.`;
}

/**
 * Контроль INV-2 перед КАЖДОЙ отправкой: ссылки, телефоны, адреса с номером
 * дома, конкретные цены с валютой. Нарушение → сообщение не отправляется.
 */
export function violatesInv2(text: string): string | null {
  if (/(https?:\/\/|www\.|\S+\.(?:ru|com|net|org|рф)\b|t\.me|@[a-z0-9_]{4,})/i.test(text)) {
    return 'link';
  }
  // телефоны: +7/8 и 10-11 цифр с разделителями или подряд
  if (/(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/.test(text)) {
    return 'phone';
  }
  if (/\d{10,}/.test(text)) {
    return 'long_digits';
  }
  // конкретная цена: число + валюта
  if (/\d[\d\s.,]*\s*(?:₽|руб|тыс\.?\s*₽|тыс\.?\s*руб|млн\s*₽|млн\s*руб|т\.р)/i.test(text)) {
    return 'price';
  }
  return null;
}

/** Ограничение длины ответа (раздел 9): ≤ 1000 символов. */
export function clampReply(text: string, max = 1000): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
