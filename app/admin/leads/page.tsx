import Link from 'next/link';
import { sql } from '@/lib/db/client';
import { toggleLeadProcessed } from './actions';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const leads = await sql`
    select l.*, d.avito_chat_id, d.intent, d.status as dialog_status
    from leads l
    left join dialogs d on d.id = l.dialog_id
    order by l.id desc
    limit 200
  `;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Лиды</h1>
      {leads.length === 0 ? (
        <p className="text-sm text-gray-500">Лидов пока нет</p>
      ) : (
        <table className="w-full rounded border bg-white text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">🔥</th>
              <th className="px-3 py-2">Summary</th>
              <th className="px-3 py-2">Диалог</th>
              <th className="px-3 py-2">Карточка</th>
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Обработан</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.map((l) => {
              const toggle = toggleLeadProcessed.bind(null, Number(l.id));
              return (
                <tr key={String(l.id)} className={`align-top hover:bg-gray-50 ${l.processed ? 'text-gray-400' : ''}`}>
                  <td className="px-3 py-2">{String(l.id)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${l.kind === 'seller' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'}`}>
                      {l.kind === 'seller' ? 'продавец' : 'покупатель'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{l.hot ? '🔥' : ''}</td>
                  <td className="max-w-md px-3 py-2">{String(l.summary ?? '—')}</td>
                  <td className="px-3 py-2">
                    {l.dialog_id != null && (
                      <Link href={`/admin/dialogs?id=${l.dialog_id}`} className="text-blue-600 hover:underline">
                        #{String(l.dialog_id)}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {l.company_id != null && (
                      <Link href={`/admin/companies/${l.company_id}`} className="text-blue-600 hover:underline">
                        #{String(l.company_id)}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(String(l.created_at)).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-3 py-2">
                    <form action={toggle}>
                      <button className="rounded border px-2 py-0.5 text-xs hover:bg-gray-100">
                        {l.processed ? '↩ вернуть' : '✓ обработан'}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
