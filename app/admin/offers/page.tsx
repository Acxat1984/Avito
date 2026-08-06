import Link from 'next/link';
import { sql } from '@/lib/db/client';
import { StatusBadge } from '@/app/admin/ui';
import { regionName } from '@/lib/normalize/regions';

export const dynamic = 'force-dynamic';

/**
 * История выдач клиентам: по коду списка и номеру позиции находится карточка.
 * Нужна, когда клиент отвечает «интересует позиция 3».
 */
export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const codeQuery = typeof sp.code === 'string' ? sp.code.trim().toUpperCase() : '';

  const offers = codeQuery
    ? await sql`select * from offers where code = ${codeQuery}`
    : await sql`select * from offers order by id desc limit 30`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Выдачи клиентам</h1>
        <p className="mt-1 text-sm text-gray-600">
          Клиент отвечает «интересует позиция 3» — найдите здесь список по коду и посмотрите, какая
          это компания. Состав фиксируется в момент отправки и потом не меняется.
        </p>
      </div>

      <form method="get" className="flex items-end gap-2 rounded border bg-white p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Код списка (например K7M)</span>
          <input
            name="code"
            defaultValue={codeQuery}
            placeholder="K7M"
            className="rounded border px-2 py-1 font-mono uppercase"
          />
        </label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-white">Найти</button>
        {codeQuery && (
          <Link href="/admin/offers" className="px-2 py-1.5 text-gray-500 hover:text-gray-900">
            сброс
          </Link>
        )}
      </form>

      {offers.length === 0 && (
        <p className="rounded border bg-white p-4 text-sm text-gray-500">
          {codeQuery ? `Список с кодом ${codeQuery} не найден` : 'Выдач пока не было'}
        </p>
      )}

      {offers.map((o) => (
        <OfferCard key={String(o.id)} offer={o} expanded={Boolean(codeQuery) || offers.length === 1} />
      ))}
    </div>
  );
}

async function OfferCard({
  offer,
  expanded,
}: {
  offer: Record<string, unknown>;
  expanded: boolean;
}) {
  const ids = (offer.company_ids as unknown as number[]).map(Number);
  const companies = ids.length
    ? await sql`select id, name, inn, region_code, year_reg, tax_system, price_k, status from companies where id = any(${ids})`
    : [];
  const byId = new Map(companies.map((c) => [Number(c.id), c]));
  const filters = (offer.filters ?? {}) as Record<string, unknown>;
  const filterText = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return (
    <section className="rounded border bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-teal-600 px-2 py-1 font-mono text-sm text-white">
          {String(offer.code)}
        </span>
        <span className="text-sm">{ids.length} позиций</span>
        {offer.note != null && <span className="text-sm text-gray-700">— {String(offer.note)}</span>}
        <span className="text-xs text-gray-400">
          {new Date(String(offer.created_at)).toLocaleString('ru-RU')}
        </span>
        {filterText && <span className="text-xs text-gray-400">фильтры: {filterText}</span>}
        {!expanded && (
          <Link
            href={`/admin/offers?code=${offer.code}`}
            className="ml-auto text-sm text-blue-600 hover:underline"
          >
            раскрыть
          </Link>
        )}
      </div>

      {expanded && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1.5">№ у клиента</th>
                <th className="px-2 py-1.5">Компания</th>
                <th className="px-2 py-1.5">ИНН</th>
                <th className="px-2 py-1.5">Регион</th>
                <th className="px-2 py-1.5">Год</th>
                <th className="px-2 py-1.5">Цена, тыс</th>
                <th className="px-2 py-1.5">Статус сейчас</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ids.map((id, i) => {
                const c = byId.get(id);
                return (
                  <tr key={id} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 text-base font-semibold">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {c ? (
                        <Link href={`/admin/companies/${id}`} className="text-blue-600 hover:underline">
                          {String(c.name)}
                        </Link>
                      ) : (
                        <span className="text-gray-400">карточка #{id} удалена</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">{c ? String(c.inn ?? '—') : '—'}</td>
                    <td className="px-2 py-1.5">{c ? regionName(c.region_code as string) ?? '—' : '—'}</td>
                    <td className="px-2 py-1.5">{c ? String(c.year_reg ?? '—') : '—'}</td>
                    <td className="px-2 py-1.5">{c ? String(c.price_k ?? '—') : '—'}</td>
                    <td className="px-2 py-1.5">{c && <StatusBadge status={String(c.status)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
