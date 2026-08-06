import Link from 'next/link';
import { sql } from '@/lib/db/client';
import { buildUpdateChanges } from '@/lib/import/match';
import { StatusBadge } from '@/app/admin/ui';
import { UploadForm } from './upload-form';
import { applyImportAction, cancelImportAction } from './actions';

export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const selectedId = sp.id ? Number(sp.id) : null;
  const actionFilter = typeof sp.action === 'string' ? sp.action : null;
  const problemsOnly = sp.problems === 'true';
  const page = Math.max(1, Number(sp.page ?? 1));

  const history = await sql`
    select id, filename, stats, status, created_at
    from imports order by id desc limit 30
  `;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Импорт из Excel</h1>
      <UploadForm />

      {selectedId !== null && Number.isInteger(selectedId) && (
        <ImportPreview id={selectedId} actionFilter={actionFilter} problemsOnly={problemsOnly} page={page} />
      )}

      <section>
        <h2 className="mb-2 font-medium">История импортов</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Импортов ещё не было</p>
        ) : (
          <table className="w-full rounded border bg-white text-sm">
            <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Файл</th>
                <th className="px-3 py-2">Статистика</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((im) => (
                <tr key={String(im.id)} className={selectedId === Number(im.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/imports?id=${im.id}`} className="text-blue-600 hover:underline">
                      #{String(im.id)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{String(im.filename ?? '—')}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{statsText(im.stats)}</td>
                  <td className="px-3 py-2"><StatusBadge status={String(im.status)} /></td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(String(im.created_at)).toLocaleString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function statsText(stats: unknown): string {
  if (!stats || typeof stats !== 'object') return '—';
  const s = stats as Record<string, unknown>;
  const parts: string[] = [];
  if (s.insert !== undefined) parts.push(`новых: ${s.insert}`);
  if (s.update !== undefined) parts.push(`обновл.: ${s.update}`);
  if (s.skip !== undefined) parts.push(`пропущено: ${s.skip}`);
  if (s.conflict !== undefined) parts.push(`конфликтов: ${s.conflict}`);
  if (s.with_problems !== undefined) parts.push(`с проблемами: ${s.with_problems}`);
  return parts.join(', ') || '—';
}

async function ImportPreview({
  id, actionFilter, problemsOnly, page,
}: {
  id: number; actionFilter: string | null; problemsOnly: boolean; page: number;
}) {
  const [imp] = await sql`select * from imports where id = ${id}`;
  if (!imp) return <p className="text-sm text-red-600">Импорт #{id} не найден</p>;

  const offset = (page - 1) * PER_PAGE;
  const rows = actionFilter
    ? await sql`select * from import_rows where import_id = ${id} and action = ${actionFilter} order by row_num limit ${PER_PAGE + 1} offset ${offset}`
    : await sql`select * from import_rows where import_id = ${id} order by row_num limit ${PER_PAGE + 1} offset ${offset}`;

  const visible = (problemsOnly ? rows.filter((r) => (r.problems as string[] | null)?.length) : rows).slice(0, PER_PAGE);
  const hasMore = rows.length > PER_PAGE;

  const updateIds = visible
    .filter((r) => r.action === 'update' && r.match_company_id !== null)
    .map((r) => Number(r.match_company_id));
  const existing = updateIds.length
    ? await sql`select * from companies where id = any(${updateIds})`
    : [];
  const byId = new Map(existing.map((c) => [Number(c.id), c]));

  const apply = applyImportAction.bind(null, id);
  const cancel = cancelImportAction.bind(null, id);
  const filterHref = (params: string) => `/admin/imports?id=${id}${params}`;

  return (
    <section className="space-y-3 rounded border bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">Предпросмотр импорта #{id} — {String(imp.filename)}</h2>
        <StatusBadge status={String(imp.status)} />
        <span className="text-xs text-gray-500">{statsText(imp.stats)}</span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href={filterHref('')} className={`rounded border px-2 py-1 ${!actionFilter && !problemsOnly ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>все</Link>
        {['insert', 'update', 'conflict', 'skip'].map((a) => (
          <Link key={a} href={filterHref(`&action=${a}`)} className={`rounded border px-2 py-1 ${actionFilter === a ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>
            {a}
          </Link>
        ))}
        <Link href={filterHref('&problems=true')} className={`rounded border px-2 py-1 ${problemsOnly ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>
          с проблемами
        </Link>
      </div>

      {imp.status === 'pending' && (
        <div className="flex gap-2">
          <form action={apply}>
            <button className="rounded bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700">
              Применить
            </button>
          </form>
          <form action={cancel}>
            <button className="rounded border px-4 py-1.5 text-sm hover:bg-gray-100">Отменить</button>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 text-left uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1.5">Строка</th>
              <th className="px-2 py-1.5">Action</th>
              <th className="px-2 py-1.5">Название</th>
              <th className="px-2 py-1.5">ИНН</th>
              <th className="px-2 py-1.5">Diff / данные</th>
              <th className="px-2 py-1.5">Проблемы</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => {
              const p = r.parsed as Record<string, unknown>;
              const diff =
                r.action === 'update' && byId.has(Number(r.match_company_id))
                  ? buildUpdateChanges(byId.get(Number(r.match_company_id))!, r.parsed as never)
                  : null;
              return (
                <tr key={String(r.id)} className="align-top hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500">{String(r.row_num)}</td>
                  <td className="px-2 py-1.5">
                    <ActionBadge action={String(r.action)} />
                    {r.match_company_id != null && (
                      <Link href={`/admin/companies/${r.match_company_id}`} className="ml-1 text-blue-600 hover:underline">
                        #{String(r.match_company_id)}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{String(p.name ?? '—')}</td>
                  <td className="px-2 py-1.5">{String(p.inn ?? p.inn_raw ?? '—')}</td>
                  <td className="px-2 py-1.5">
                    {diff
                      ? Object.entries(diff).map(([f, ch]) => (
                          <div key={f}>
                            <b>{f}</b>: <span className="text-gray-400">{String(ch.old ?? '∅')}</span> → {String(ch.new)}
                          </div>
                        ))
                      : r.action === 'insert'
                        ? `${p.region_code ?? p.city_raw ?? ''} ${p.year_reg ?? ''} ${p.tax_system ?? ''} ${p.price_k ?? ''}`
                        : null}
                  </td>
                  <td className="px-2 py-1.5 text-orange-700">
                    {((r.problems as string[] | null) ?? []).join('; ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 text-sm">
        {page > 1 && (
          <Link href={filterHref(`${actionFilter ? `&action=${actionFilter}` : ''}&page=${page - 1}`)} className="rounded border px-2 py-1 hover:bg-gray-100">
            ← назад
          </Link>
        )}
        {hasMore && (
          <Link href={filterHref(`${actionFilter ? `&action=${actionFilter}` : ''}&page=${page + 1}`)} className="rounded border px-2 py-1 hover:bg-gray-100">
            дальше →
          </Link>
        )}
      </div>
    </section>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    insert: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    conflict: 'bg-red-100 text-red-800',
    skip: 'bg-gray-100 text-gray-500',
  };
  return <span className={`rounded px-1.5 py-0.5 ${colors[action] ?? ''}`}>{action}</span>;
}
