import Link from 'next/link';
import { sql } from '@/lib/db/client';
import { StatusBadge } from '@/app/admin/ui';

export const dynamic = 'force-dynamic';

export default async function DialogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const selectedId = sp.id ? Number(sp.id) : null;

  const dialogs = await sql`
    select * from dialogs order by updated_at desc limit 100
  `;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Диалоги</h1>
      {dialogs.length === 0 ? (
        <p className="text-sm text-gray-500">Диалогов пока нет</p>
      ) : (
        <table className="w-full rounded border bg-white text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Чат Avito</th>
              <th className="px-3 py-2">Intent</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Сообщ. бота</th>
              <th className="px-3 py-2">Обновлён</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dialogs.map((d) => (
              <tr key={String(d.id)} className={Number(d.id) === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                <td className="px-3 py-2">{String(d.id)}</td>
                <td className="px-3 py-2 font-mono text-xs">{String(d.avito_chat_id)}</td>
                <td className="px-3 py-2">{String(d.intent ?? '—')}</td>
                <td className="px-3 py-2"><StatusBadge status={String(d.status)} /></td>
                <td className="px-3 py-2">{String(d.bot_messages_sent)} / 2</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {new Date(String(d.updated_at)).toLocaleString('ru-RU')}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/dialogs?id=${d.id}`} className="text-blue-600 hover:underline">
                    история
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedId !== null && Number.isInteger(selectedId) && <DialogDetail id={selectedId} />}
    </div>
  );
}

async function DialogDetail({ id }: { id: number }) {
  const [dialog] = await sql`select * from dialogs where id = ${id}`;
  if (!dialog) return <p className="text-sm text-red-600">Диалог #{id} не найден</p>;

  const [actions, lead, company] = await Promise.all([
    sql`select * from bot_actions where dialog_id = ${id} order by id`,
    sql`select * from leads where dialog_id = ${id} order by id desc limit 1`,
    sql`select id, name, status from companies where dialog_id = ${id} limit 1`,
  ]);

  return (
    <section className="space-y-3 rounded border bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">Диалог #{id}</h2>
        <StatusBadge status={String(dialog.status)} />
        <span className="text-xs text-gray-500">intent: {String(dialog.intent ?? '—')}</span>
        <span className="text-xs text-gray-500">сообщений бота: {String(dialog.bot_messages_sent)} / 2</span>
        {lead.length > 0 && (
          <Link href="/admin/leads" className="text-xs text-blue-600 hover:underline">лид #{String(lead[0].id)}</Link>
        )}
        {company.length > 0 && (
          <Link href={`/admin/companies/${company[0].id}`} className="text-xs text-blue-600 hover:underline">
            карточка #{String(company[0].id)}
          </Link>
        )}
      </div>

      {dialog.extracted != null && (
        <div>
          <h3 className="text-xs font-medium uppercase text-gray-500">Extracted</h3>
          <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
            {JSON.stringify(dialog.extracted, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <h3 className="text-xs font-medium uppercase text-gray-500">История (bot_actions)</h3>
        {actions.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">Действий нет</p>
        ) : (
          <ul className="mt-1 divide-y rounded border text-xs">
            {actions.map((a) => (
              <li key={String(a.id)} className="px-3 py-2">
                <div className="flex justify-between">
                  <b>{String(a.action)}</b>
                  <span className="text-gray-400">{new Date(String(a.created_at)).toLocaleString('ru-RU')}</span>
                </div>
                {a.payload != null && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-600">
                    {JSON.stringify(a.payload, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
