import { config } from '@/lib/config';
import { ANALYZE_SYSTEM } from './prompts';
import { Anonymizer } from './anonymize';

export interface Extracted {
  form: string | null;
  city: string | null;
  year: string | null;
  tax: string | null;
  turnover: string | null;
  banks: string | null;
  debts: string | null;
  license: string | null;
  address: string | null;
  reason: string | null;
  price: string | null;
  purpose: string | null;
  inn: string | null;
  name: string | null;
  contact: string | null;
}

export interface Analysis {
  intent: 'sell' | 'buy' | 'unclear';
  escalate_reason:
    | null
    | 'asks_human'
    | 'legal_scheme'
    | 'price_talk'
    | 'asks_contacts'
    | 'uncertain_parse';
  extracted: Partial<Extracted>;
  has_enough: boolean;
}

/**
 * Анализ сообщений клиента через OpenRouter. Возвращает строгий JSON.
 * При любой ошибке (сеть, невалидный JSON) → uncertain_parse: решения
 * принимает код, эскалация безопаснее молчаливого падения.
 */
export async function analyzeDialog(
  clientMessages: string[],
  prevExtracted?: Record<string, unknown> | null,
): Promise<Analysis> {
  const fallback: Analysis = {
    intent: 'unclear',
    escalate_reason: 'uncertain_parse',
    extracted: {},
    has_enough: false,
  };

  try {
    // обезличивание: телефоны/email/ссылки/ИНН уходят в LLM плейсхолдерами,
    // реальные значения подставляются обратно только у нас (см. anonymize.ts)
    const anon = new Anonymizer();
    const maskedMessages = clientMessages.map((m) => anon.mask(m));
    const maskedPrev = prevExtracted ? anon.mask(JSON.stringify(prevExtracted)) : null;

    const userContent =
      (maskedPrev ? `Ранее извлечённые данные: ${maskedPrev}\n\n` : '') +
      `Сообщения клиента:\n${maskedMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [
          { role: 'system', content: ANALYZE_SYSTEM },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.error('[llm] openrouter error', res.status, await res.text());
      return fallback;
    }
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const jsonText = content.replace(/^```(?:json)?\s*|```\s*$/g, '').trim();
    const parsed = JSON.parse(jsonText) as Analysis;

    if (!['sell', 'buy', 'unclear'].includes(parsed.intent)) parsed.intent = 'unclear';
    // подстановка реальных значений вместо плейсхолдеров — только на нашей стороне
    parsed.extracted = anon.unmaskDeep(parsed.extracted ?? {});
    parsed.has_enough = Boolean(parsed.has_enough);
    return parsed;
  } catch (e) {
    console.error('[llm] analyze failed:', e);
    return fallback;
  }
}
