/**
 * Живая проверка разбора переписки нейросетью (OpenRouter).
 * Ничего не пишет в базу — только показывает, что распозналось.
 * Запуск: npx tsx --env-file=.env.local scripts/test-paste-parse.ts
 */
import dns from 'node:dns';

/**
 * ОБХОД ЛОКАЛЬНОЙ ПРОБЛЕМЫ СЕТИ (только для этого скрипта).
 * openrouter.ai публикует лишь AAAA-записи, а на машине владельца IPv6 не работает
 * → node fetch падает с «Connect Timeout». Резолвим домен в IPv4 Cloudflare.
 * На Vercel IPv6 есть, поэтому в проде обход не нужен.
 */
if (process.env.LLM_FORCE_IPV4 !== '0') {
  const orig = dns.lookup.bind(dns);
  (dns as unknown as { lookup: typeof dns.lookup }).lookup = ((
    host: string,
    opts: unknown,
    cb: unknown,
  ) => {
    if (host === 'openrouter.ai') {
      const done = (typeof opts === 'function' ? opts : cb) as (
        e: Error | null, a?: string | Array<{ address: string; family: number }>, f?: number,
      ) => void;
      const all = typeof opts === 'object' && opts !== null && (opts as { all?: boolean }).all;
      if (all) return done(null, [{ address: '104.16.0.1', family: 4 }]);
      return done(null, '104.16.0.1', 4);
    }
    return (orig as (...a: unknown[]) => unknown)(host, opts, cb);
  }) as typeof dns.lookup;
}

import { parseCompaniesFromText } from '../lib/llm/parse-company';

const CHAT = `
Продавец, 14:02
Здравствуйте! Да, ООО актуально.
Фирма Стройальянс, ИНН 6316269619, Самара.
Открыта в 2021 году, УСН 6%.
Обороты: 2023 - 4,2 млн, 2024 - 12 млн, 2025 - 18 млн.
Счёт в Альфе, долгов нет, суды пустые.
Адрес нежилой, офис в аренде до 2027.
Цена 150 тыс, торг небольшой. Продаю, потому что закрываю направление.
Телефон для связи +7 927 825-01-11

Покупатель, 14:05
А ещё что-то есть?

Продавец, 14:07
Есть вторая — Гранит, ИНН 7328108216, Ульяновск, 2019 год, ОСНО.
Оборотов почти нет, 2024 - 0,8 млн. Есть лицензия МЧС.
Цена 200, нотариат сверху.
`;

async function main() {
  const t0 = Date.now();
  const res = await parseCompaniesFromText(CHAT);
  console.log(`Ответ за ${Date.now() - t0} мс`);

  if (!res.ok) {
    console.error('ОШИБКА:', res.error);
    process.exit(1);
  }

  console.log(`Распознано компаний: ${res.companies.length}\n`);
  for (const c of res.companies) {
    const n = c.normalized;
    console.log('--- сырое от нейросети ---');
    console.log(JSON.stringify(c.raw, null, 2));
    console.log('--- после нормализации ---');
    console.log(
      JSON.stringify(
        {
          name: n.name,
          inn: n.inn,
          region_code: n.region_code,
          city_raw: n.city_raw,
          year_reg: n.year_reg,
          tax_system: n.tax_system,
          turnover_last_m: n.turnover_last_m,
          price_k: n.price_k,
          seller_contact: n.seller_contact,
          has_license: n.has_license,
          banks: n.banks,
          extra: n.extra,
          problems: n.problems,
        },
        null,
        2,
      ),
    );
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
