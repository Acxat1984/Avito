'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NormalizedCompany } from '@/lib/normalize';
import { saveParsedCompanies } from './actions';

interface Preview {
  normalized: NormalizedCompany;
  raw: Record<string, string | null>;
  match: { id: number; name: string; status: string } | null;
}

const FIELDS: Array<[keyof NormalizedCompany, string]> = [
  ['name', 'Название'],
  ['inn', 'ИНН'],
  ['region_code', 'Регион'],
  ['year_reg', 'Год'],
  ['tax_system', 'Налог'],
  ['turnover_last_m', 'Оборот, млн'],
  ['price_k', 'Цена, тыс'],
  ['seller_contact', 'Контакт'],
  ['banks', 'Банки'],
];

export function PasteForm() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<{ inserted: number; updated: number } | null>(null);

  async function analyze() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Ошибка ${res.status}`);
        return;
      }
      setPreviews(data.companies);
      setSelected(new Set(data.companies.map((_: Preview, i: number) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!previews) return;
    setBusy(true);
    try {
      const items = previews
        .filter((_, i) => selected.has(i))
        .map((p) => ({ normalized: p.normalized, matchId: p.match?.id ?? null }));
      const result = await saveParsedCompanies(items);
      setSaved(result);
      setPreviews(null);
      setText('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-gray-600">
          Вставьте текст переписки или заметок — по одной или нескольким компаниям
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={
            'Например:\nДобрый день, продаю ООО Ромашка, ИНН 1655123456, Казань, 2021 год, УСН 6%, обороты 24г-12млн, счёт в Сбере, долгов нет, хочу 150'
          }
          className="mt-1 w-full rounded border p-3 font-mono text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={analyze}
          disabled={busy || !text.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Разбираю…' : 'Разобрать'}
        </button>
        <span className="text-xs text-gray-500">
          Телефоны, e-mail и ИНН маскируются перед отправкой в нейросеть
        </span>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {saved && (
        <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Сохранено: новых {saved.inserted}, обновлено {saved.updated}.{' '}
          <Link href="/admin/companies" className="underline">
            Перейти к компаниям
          </Link>
        </p>
      )}

      {previews && previews.length === 0 && (
        <p className="rounded border bg-white p-3 text-sm text-gray-600">
          В тексте не найдено данных о компаниях.
        </p>
      )}

      {previews && previews.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Найдено компаний: {previews.length}</h2>
          {previews.map((p, i) => (
            <div key={i} className="rounded border bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setSelected(next);
                  }}
                />
                {p.normalized.name ?? 'Без названия'}
                {p.match ? (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                    обновит #{p.match.id} ({p.match.status})
                  </span>
                ) : (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">новая</span>
                )}
              </label>

              <table className="mt-2 w-full text-xs">
                <tbody>
                  {FIELDS.map(([f, label]) => {
                    const v = p.normalized[f];
                    if (v === null || v === undefined || v === '') return null;
                    return (
                      <tr key={String(f)}>
                        <td className="py-0.5 pr-3 text-gray-500">{label}</td>
                        <td className="py-0.5">{String(v)}</td>
                      </tr>
                    );
                  })}
                  {p.normalized.extra && (
                    <tr>
                      <td className="py-0.5 pr-3 align-top text-gray-500">Доп.</td>
                      <td className="py-0.5">{p.normalized.extra}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {p.normalized.problems.length > 0 && (
                <p className="mt-2 text-xs text-orange-700">
                  Требует проверки: {p.normalized.problems.join('; ')}
                </p>
              )}
            </div>
          ))}

          <button
            onClick={save}
            disabled={busy || selected.size === 0}
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? 'Сохраняю…' : `Сохранить выбранные (${selected.size})`}
          </button>
        </div>
      )}
    </div>
  );
}
