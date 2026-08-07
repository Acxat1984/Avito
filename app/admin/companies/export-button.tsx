'use client';

import { useState } from 'react';

/**
 * Экспорт в Excel с выбором наполнения: полная таблица или та же таблица
 * без контакта продавца и цены закупа (такой файл можно отдать партнёру).
 */
export function ExportButton({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  const href = (mode: 'full' | 'nocontacts', format: 'xlsx' | 'csv' = 'xlsx') =>
    `/api/admin/export.${format}?${[query, `mode=${mode}`].filter(Boolean).join('&')}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
      >
        Экспорт .xlsx
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Что выгрузить?</h2>
            <p className="mt-1 text-sm text-gray-600">
              Выгружаются все компании под текущим фильтром, сначала недавно добавленные.
            </p>

            <div className="mt-4 space-y-2">
              <a
                href={href('full')}
                onClick={() => setOpen(false)}
                className="block rounded border border-blue-200 bg-blue-50 p-3 hover:bg-blue-100"
              >
                <div className="font-medium">Выгрузить с контактами и ценой</div>
                <div className="text-xs text-gray-600">
                  Все поля карточки, включая контакт продавца и цену закупа. Только для внутреннего
                  использования.
                </div>
              </a>
              <a
                href={href('nocontacts')}
                onClick={() => setOpen(false)}
                className="block rounded border p-3 hover:bg-gray-100"
              >
                <div className="font-medium">Выгрузить без контактов и цен закупа</div>
                <div className="text-xs text-gray-600">
                  Та же таблица со всеми данными, но без контакта продавца и закупочной цены —
                  можно отправлять партнёру.
                </div>
              </a>
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-gray-500">
              <span>
                Нужен .csv:{' '}
                <a href={href('full', 'csv')} className="text-blue-600 hover:underline">
                  с контактами
                </a>{' '}
                ·{' '}
                <a href={href('nocontacts', 'csv')} className="text-blue-600 hover:underline">
                  без контактов
                </a>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border px-3 py-1 hover:bg-gray-100"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
