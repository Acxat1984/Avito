'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Дропзона для .xlsx → POST /api/admin/imports → предпросмотр. */
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/imports', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.foundColumns
            ? `${data.error}. Найденные колонки: ${data.foundColumns.join(', ')}`
            : data.error ?? `Ошибка ${res.status}`,
        );
        return;
      }
      router.push(`/admin/imports?id=${data.import_id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void upload(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm transition-colors ${
          drag ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'
        }`}
      >
        {busy ? 'Загрузка и разбор…' : 'Перетащите .xlsx сюда или кликните для выбора'}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
