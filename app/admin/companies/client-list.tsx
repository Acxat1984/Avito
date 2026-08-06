'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CompanyFilters } from '@/lib/db/queries';
import { saveOffer } from '@/app/admin/offers/actions';

interface KeyRow {
  pos: number;
  id: number;
  name: string;
  inn: string | null;
}

/**
 * Блок «Отправить клиенту»: обезличенный текст с ID карточек + xlsx.
 * Клиент отвечает номером (ID) — владелец сразу открывает карточку.
 */
export function ClientListBlock({
  text,
  count,
  xlsxHref,
  keyRows,
  filters,
}: {
  text: string;
  count: number;
  xlsxHref: string;
  keyRows: KeyRow[];
  filters: CompanyFilters;
}) {
  const [openText, setOpenText] = useState(false);
  const [openKey, setOpenKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function fix() {
    setBusy(true);
    try {
      const r = await saveOffer(filters, note.trim() || null);
      setSaved(r.code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-teal-200 bg-teal-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Отправить клиенту</span>
        <span className="text-xs text-gray-600">
          обезличенный список с номерами карточек, только проверенные ({count} шт.) — без названий,
          ИНН, контактов и цен
        </span>
        <button
          onClick={() => setOpenText((v) => !v)}
          className="rounded border bg-white px-3 py-1.5 hover:bg-gray-100"
        >
          {openText ? 'Скрыть текст' : 'Текст для чата'}
        </button>
        <a href={xlsxHref} className="rounded border bg-white px-3 py-1.5 hover:bg-gray-100">
          Скачать .xlsx
        </a>
        <button
          onClick={() => setOpenKey((v) => !v)}
          className="rounded border bg-white px-3 py-1.5 hover:bg-gray-100"
        >
          {openKey ? 'Скрыть расшифровку' : 'Расшифровка номеров'}
        </button>
      </div>

      {count > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-teal-200 pt-2">
          {saved ? (
            <span className="text-xs text-gray-600">
              Выдача сохранена в{' '}
              <Link href="/admin/offers" className="underline">
                истории
              </Link>{' '}
              (код {saved}) — видно, кому и что отправляли.
            </span>
          ) : (
            <>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="кому отправляем (имя, чат) — необязательно"
                className="rounded border px-2 py-1 text-xs"
              />
              <button
                onClick={fix}
                disabled={busy}
                className="rounded border bg-white px-3 py-1.5 hover:bg-gray-100 disabled:opacity-50"
              >
                {busy ? 'Сохраняю…' : 'Записать в историю выдач'}
              </button>
              <span className="text-xs text-gray-500">необязательно — для учёта, кому что ушло</span>
            </>
          )}
        </div>
      )}

      {openText && (
        <div className="mt-2">
          <textarea
            readOnly
            value={text}
            rows={Math.min(14, text.split('\n').length + 1)}
            className="w-full rounded border bg-white p-2 font-mono text-xs"
          />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-1 rounded bg-teal-600 px-3 py-1.5 text-white hover:bg-teal-700"
          >
            {copied ? 'Скопировано ✓' : 'Копировать'}
          </button>
        </div>
      )}

      {openKey && (
        <div className="mt-2 overflow-x-auto rounded border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-100 text-left text-gray-600">
              <tr>
                <th className="px-2 py-1">№ (он же ID)</th>
                <th className="px-2 py-1">Компания</th>
                <th className="px-2 py-1">ИНН</th>
                <th className="px-2 py-1">Карточка</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keyRows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1 font-medium">{r.id}</td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1">{r.inn ?? '—'}</td>
                  <td className="px-2 py-1">
                    <Link href={`/admin/companies/${r.id}`} className="text-blue-600 hover:underline">
                      открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-xs text-gray-500">
            Клиенту уходит только номер — названия и ИНН видны исключительно здесь.
          </p>
        </div>
      )}
    </div>
  );
}
