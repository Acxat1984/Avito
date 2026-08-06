import { config } from '@/lib/config';
import { Anonymizer } from './anonymize';
import { normalizeCompany, NormalizedCompany } from '@/lib/normalize';

/**
 * Разбор произвольного текста (переписка из Avito, заметки) в карточки компаний.
 * Персональные данные маскируются ДО отправки в LLM (см. anonymize.ts),
 * обратная подстановка — только на нашей стороне.
 */

const SYSTEM = `Ты — парсер сообщений о продаже готовых фирм (ООО/АО) с площадки объявлений.
Из текста извлеки данные по КАЖДОЙ упомянутой компании. Верни СТРОГО JSON без пояснений:

{"companies": [{
  "name": string | null,      // название фирмы, без кавычек и без «ООО»
  "inn": string | null,       // ИНН как в тексте
  "city": string | null,      // город/регион как в тексте
  "year": string | null,      // год регистрации как в тексте ('2021', '08.24', '22')
  "tax": string | null,       // система налогообложения ('усн 6', 'осно', 'усн д-р')
  "turnover": string | null,  // обороты как в тексте ('23-4млн; 24-12млн')
  "price": string | null,     // цена как в тексте ('100', 'дог', '150 торг')
  "banks": string | null,     // банки/счета
  "debts": string | null,     // долги, блокировки, суды
  "license": string | null,   // лицензии
  "address": string | null,   // адрес (жилой/нежилой)
  "reason": string | null,    // причина продажи
  "contact": string | null,   // контакт продавца, если указан
  "extra": string | null      // прочее существенное
}]}

Правила:
- Значения копируй ИЗ ТЕКСТА как есть, ничего не додумывай и не пересчитывай. Нет данных → null.
- Цены в этой нише указывают в тысячах рублей — просто копируй число.
- Плейсхолдеры вида [PHONE_1], [INN_1], [EMAIL_1] — это замаскированные данные, копируй их как есть.
- Если компаний несколько — верни несколько элементов. Если ни одной — верни {"companies": []}.
Отвечай ТОЛЬКО JSON.`;

export interface ParsedCompanyPreview {
  normalized: NormalizedCompany;
  /** сырые значения от LLM — показываем в предпросмотре */
  raw: Record<string, string | null>;
}

export async function parseCompaniesFromText(
  text: string,
): Promise<{ ok: true; companies: ParsedCompanyPreview[] } | { ok: false; error: string }> {
  if (!text.trim()) return { ok: false, error: 'Пустой текст' };

  const anon = new Anonymizer();
  const masked = anon.mask(text);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: masked },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `LLM вернул ${res.status}` };
    }
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|```\s*$/g, '').trim()) as {
      companies?: Array<Record<string, string | null>>;
    };

    const companies = (parsed.companies ?? []).map((c) => {
      // подстановка реальных значений вместо плейсхолдеров
      const raw = anon.unmaskDeep(c);
      return {
        raw,
        normalized: normalizeCompany({
          name: raw.name,
          inn: raw.inn,
          city: raw.city,
          year: raw.year,
          tax: raw.tax,
          turnover: raw.turnover,
          price: raw.price,
          seller_contact: raw.contact,
          extra: [
            raw.banks && `банки: ${raw.banks}`,
            raw.debts && `долги/блокировки: ${raw.debts}`,
            raw.license && `лицензии: ${raw.license}`,
            raw.address && `адрес: ${raw.address}`,
            raw.reason && `причина продажи: ${raw.reason}`,
            raw.extra,
          ]
            .filter(Boolean)
            .join('; ') || null,
        }),
      };
    });

    return { ok: true, companies };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
