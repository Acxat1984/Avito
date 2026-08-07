'use client';

import { useState, useTransition } from 'react';
import { checkAllEgrul, resolveProblemCompanies } from './actions';
import type { EgrulSweepResult } from './egrul-types';

/**
 * Кнопка массовой проверки статусов по ЕГРЮЛ и окно с итогом.
 * Если нашлись недействующие компании — предлагает убрать их из базы.
 */
export function EgrulCheckButton() {
  const [result, setResult] = useState<EgrulSweepResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resolving, startResolve] = useTransition();

  const run = () => {
    setDone(null);
    startTransition(async () => {
      try {
        setResult(await checkAllEgrul());
      } catch (e) {
        setResult({
          checked: 0, active: 0, changed: [], problem: [], notFound: [],
          errors: [e instanceof Error ? e.message : String(e)],
          remaining: 0,
        });
      }
    });
  };

  const resolve = (mode: 'archive' | 'delete') => {
    if (!result) return;
    const ids = result.problem.map((c) => c.id);
    const word = mode === 'delete' ? 'удалить из базы' : 'перевести в архив';
    if (!window.confirm(`Точно ${word} ${ids.length} компаний?`)) return;
    startResolve(async () => {
      const n = await resolveProblemCompanies(ids, mode);
      setDone(mode === 'delete' ? `Удалено карточек: ${n}` : `Переведено в архив: ${n}`);
      setResult({ ...result, problem: [] });
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
      >
        {pending ? 'Проверяю по ЕГРЮЛ…' : '🔍 Проверить статус компаний'}
      </button>

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Проверка проведена</h2>

            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <Row label="Проверено карточек" value={result.checked} />
              <Row label="Действующие" value={result.active} />
              <Row label="Недействующие" value={result.problem.length} />
              <Row label="Не найдены в ЕГРЮЛ" value={result.notFound.length} />
              {result.remaining > 0 && (
                <Row label="Осталось на следующий прогон" value={result.remaining} />
              )}
            </dl>

            <Block title="Новый статус" items={result.changed} empty="статусы не изменились" />

            {result.problem.length > 0 && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-800">
                  Эти компании больше не действующие — их стоит убрать из базы:
                </p>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {result.problem.map((c) => (
                    <li key={c.id}>
                      #{c.id} {c.name} — <b>{c.statusRu}</b>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => resolve('archive')}
                    className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Убрать в архив ({result.problem.length})
                  </button>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => resolve('delete')}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Удалить из базы ({result.problem.length})
                  </button>
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="mt-4 rounded border border-orange-200 bg-orange-50 p-3 text-sm">
                <p className="font-medium text-orange-800">Ошибки проверки:</p>
                <ul className="mt-1 space-y-0.5">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {done && <p className="mt-3 text-sm font-medium text-green-700">{done}</p>}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-0.5">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Block({
  title, items, empty,
}: {
  title: string;
  items: Array<{ id: number; name: string; statusRu: string }>;
  empty: string;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm">
          {items.map((c) => (
            <li key={c.id}>
              #{c.id} {c.name} — <b>{c.statusRu}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
