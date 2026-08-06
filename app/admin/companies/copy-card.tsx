'use client';

import { useState } from 'react';

/** Копирование карточки в формате выдачи партнёру (полные данные). */
export function CopyCardButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-blue-200 bg-blue-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Карточка для отправки партнёру</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
        >
          {open ? 'Скрыть' : 'Показать'}
        </button>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          {copied ? 'Скопировано ✓' : 'Копировать'}
        </button>
        <span className="text-xs text-gray-600">
          содержит название, ИНН и цену — только для своих, не для покупателей на Avito
        </span>
      </div>
      {open && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border bg-white p-2 text-xs">
          {text}
        </pre>
      )}
    </div>
  );
}
