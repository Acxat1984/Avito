/** Какие поля DaData заполнены на нашем тарифе, а какие приходят пустыми. */
import { config } from '../lib/config';

async function fetchParty(inn: string) {
  const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.dadata.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: inn }),
  });
  return (await res.json()).suggestions?.[0]?.data ?? null;
}

const INTERESTING = [
  'finance', 'finance_history', 'employee_count', 'capital', 'founders',
  'managers', 'licenses', 'okveds', 'phones', 'emails', 'sites',
  'documents', 'authorities', 'predecessors', 'successors', 'invalid',
];

async function main() {
  for (const inn of ['7707083893', '1655505607']) {
    const d = await fetchParty(inn);
    if (!d) continue;
    console.log(`\n### ИНН ${inn} — ${d.name?.short_with_opf}`);
    for (const f of INTERESTING) {
      const v = d[f];
      const state =
        v === null || v === undefined
          ? 'ПУСТО (недоступно на тарифе)'
          : Array.isArray(v)
            ? `массив ${v.length}: ${JSON.stringify(v).slice(0, 150)}`
            : JSON.stringify(v).slice(0, 200);
      console.log(`  ${f.padEnd(18)} → ${state}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
