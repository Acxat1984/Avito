/** Проверка ГИР БО (bo.nalog.ru) — официальная бухотчётность ФНС, выручка по годам. */

async function main() {
  const inn = '1655505607';
  const searchUrl = `https://bo.nalog.ru/nbo/organizations/search?query=${inn}&page=0`;
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  };

  const res = await fetch(searchUrl, { headers });
  console.log('поиск:', res.status);
  const text = await res.text();
  console.log('ответ:', text.slice(0, 500));
  if (!res.ok) return;

  const found = JSON.parse(text);
  const org = Array.isArray(found) ? found[0] : found.content?.[0];
  if (!org) {
    console.log('организация не найдена');
    return;
  }
  console.log(`\nнайдено: ${org.shortName ?? org.fullName} | id=${org.id}`);

  const detailsUrl = `https://bo.nalog.ru/nbo/organizations/${org.id}/bfo/`;
  const det = await fetch(detailsUrl, { headers });
  console.log('\nотчётность:', det.status);
  const dt = await det.text();
  console.log(dt.slice(0, 800));
}

main().catch((e) => {
  console.error('ОШИБКА:', e instanceof Error ? e.message : e);
  process.exit(1);
});
