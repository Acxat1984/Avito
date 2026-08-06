/**
 * Ссылки на бесплатные официальные источники для ручной проверки компании.
 * Открываются в новой вкладке с уже подставленным ИНН.
 */
const SOURCES: Array<{ label: string; hint: string; url: (inn: string) => string }> = [
  {
    label: 'ГИР БО',
    hint: 'бухотчётность: выручка, прибыль по годам',
    url: (inn) => `https://bo.nalog.ru/search?query=${inn}&page=1`,
  },
  {
    label: 'Прозрачный бизнес',
    hint: 'налоги, долги, численность, спецрежим',
    url: (inn) => `https://pb.nalog.ru/search.html?mode=search-all&queryAll=${inn}`,
  },
  {
    label: 'Выписка ЕГРЮЛ',
    hint: 'официальная выписка PDF',
    url: (inn) => `https://egrul.nalog.ru/index.html?query=${inn}`,
  },
  {
    label: 'Федресурс',
    hint: 'банкротства и сообщения о ликвидации',
    url: (inn) => `https://bankrot.fedresurs.ru/bankrupts?searchString=${inn}`,
  },
  {
    label: 'Арбитраж',
    hint: 'судебные дела (kad.arbitr.ru)',
    url: () => 'https://kad.arbitr.ru/',
  },
];

export function ExternalChecks({ inn }: { inn: string | null }) {
  if (!inn) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-2 text-xs font-medium uppercase text-gray-500">
        Проверить в открытых источниках (бесплатно)
      </div>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <a
            key={s.label}
            href={s.url(inn)}
            target="_blank"
            rel="noopener noreferrer"
            title={s.hint}
            className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            {s.label} ↗
            <span className="ml-1 text-xs text-gray-400">{s.hint}</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-400">
        ИНН {inn} подставляется в поиск автоматически. В Арбитраже ИНН нужно вставить вручную —
        сайт не принимает его ссылкой.
      </p>
    </div>
  );
}
