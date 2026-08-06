import Link from 'next/link';
import { sql } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** Дашборд (раздел 7): счётчики + последние эскалации. */
export default async function DashboardPage() {
  const [byStatus, counters, escalations] = await Promise.all([
    sql`select status, count(*)::int as n from companies group by status order by status`,
    sql`
      select
        (select count(*)::int from companies where needs_review) as needs_review,
        (select count(*)::int from leads where created_at > now() - interval '7 days') as leads_week,
        (select count(*)::int from dialogs) as dialogs,
        (select coalesce(sum(bot_messages_sent), 0)::int from dialogs) as bot_messages
    `,
    sql`
      select d.id, d.avito_chat_id, d.intent, d.updated_at, d.extracted
      from dialogs d
      where d.status = 'escalated'
      order by d.updated_at desc
      limit 10
    `,
  ]);
  const c = counters[0];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Дашборд</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card title="Требуют проверки" value={c.needs_review} href="/admin/companies?needs_review=true" />
        <Card title="Лиды за неделю" value={c.leads_week} href="/admin/leads" />
        <Card title="Диалогов всего" value={c.dialogs} href="/admin/dialogs" />
        <Card title="Сообщений бота" value={c.bot_messages} href="/admin/dialogs" />
      </div>

      <section>
        <h2 className="mb-2 font-medium">Компании по статусам</h2>
        <div className="flex flex-wrap gap-3">
          {byStatus.length === 0 && <span className="text-sm text-gray-500">База пуста</span>}
          {byStatus.map((s) => (
            <Link
              key={String(s.status)}
              href={`/admin/companies?status=${s.status}`}
              className="rounded border bg-white px-3 py-2 text-sm hover:bg-gray-100"
            >
              {String(s.status)}: <b>{Number(s.n)}</b>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Последние эскалации</h2>
        {escalations.length === 0 ? (
          <p className="text-sm text-gray-500">Эскалаций нет</p>
        ) : (
          <ul className="divide-y rounded border bg-white text-sm">
            {escalations.map((d) => (
              <li key={String(d.id)} className="flex items-center justify-between px-3 py-2">
                <span>
                  #{String(d.id)} · чат {String(d.avito_chat_id)} · intent: {String(d.intent ?? '—')}
                </span>
                <Link className="text-blue-600 hover:underline" href={`/admin/dialogs?id=${d.id}`}>
                  открыть
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ title, value, href }: { title: string; value: unknown; href: string }) {
  return (
    <Link href={href} className="rounded border bg-white p-4 hover:bg-gray-100">
      <div className="text-2xl font-semibold">{Number(value)}</div>
      <div className="text-sm text-gray-600">{title}</div>
    </Link>
  );
}
