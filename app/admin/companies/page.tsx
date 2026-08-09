import Link from 'next/link';
import { queryCompanies, filtersFromSearchParams } from '@/lib/db/queries';
import { REGION_NAMES } from '@/lib/normalize/regions';
import { StatusBadge, EgrulBadge } from '@/app/admin/ui';
import { bulkSetStatus, bulkSetStatusByFilter, bulkDelete } from './actions';
import { SelectAllCheckbox, ConfirmButton } from './bulk-controls';
import { EgrulCheckButton } from './egrul-check';
import { ExportButton } from './export-button';

export const dynamic = 'force-dynamic';

const PER_PAGE = 50;
const TAXES = ['osno', 'usn6', 'usn_dr', 'ausn'];
const STATUSES = ['draft', 'verified', 'reserved', 'sold', 'archived'];
// значения source, которые реально пишутся в базу: импорт, бот Avito, вручную,
// быстрое добавление по ИНН (quick) и разбор переписки из Telegram (telegram)
const SOURCES = ['import', 'avito_bot', 'manual', 'quick', 'telegram'];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = filtersFromSearchParams(sp);
  const page = Math.max(1, Number(sp.page ?? 1));
  const { rows, total } = await queryCompanies(filters, PER_PAGE, (page - 1) * PER_PAGE);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v && k !== 'page') qs.set(k, v);
  }
  const exportQs = qs.toString();

  const deleted = typeof sp.deleted === 'string' ? Number(sp.deleted) : null;

  return (
    <div className="space-y-4">
      {deleted !== null && Number.isFinite(deleted) && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {deleted > 0 ? `Удалено карточек: ${deleted}` : 'Карточка удалена из базы'}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Компании <span className="text-sm font-normal text-gray-500">({total})</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          <EgrulCheckButton />
          <ExportButton query={exportQs} />
          <Link
            href="/admin/companies/new"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            + компания
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded border bg-white p-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Поиск (ID / название / ИНН)</span>
          <input
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="223 или Ромашка"
            className="rounded border px-2 py-1"
          />
        </label>
        <Select name="region" label="Регион" value={filters.region} options={Object.keys(REGION_NAMES).map((c) => [c, REGION_NAMES[c]])} />
        <Select name="status" label="Статус" value={filters.status} options={STATUSES.map((s) => [s, s])} />
        <Select name="tax" label="Налог" value={filters.tax} options={TAXES.map((t) => [t, t])} />
        <Select name="source" label="Источник" value={filters.source} options={SOURCES.map((s) => [s, s])} />
        <RangeFilter
          label="Обороты, млн ₽"
          nameMin="turnover_min"
          nameMax="turnover_max"
          min={filters.turnover_min}
          max={filters.turnover_max}
        />
        <RangeFilter
          label="Цена, тыс ₽"
          nameMin="price_min"
          nameMax="price_max"
          min={filters.price_min}
          max={filters.price_max}
        />
        <label className="flex items-center gap-1 pb-1">
          <input type="checkbox" name="needs_review" value="true" defaultChecked={filters.needs_review === true} />
          <span>требует проверки</span>
        </label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-white">Фильтровать</button>
        <Link href="/admin/companies" className="px-2 py-1.5 text-gray-500 hover:text-gray-900">
          сброс
        </Link>
      </form>

      <form action={bulkSetStatus}>
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded border bg-white p-2 text-sm">
        <span className="text-xs text-gray-500">Массовая смена статуса:</span>
        <select name="target_status" defaultValue="verified" className="rounded border px-2 py-1">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <ConfirmButton
          message="Сменить статус у отмеченных компаний?"
          className="rounded bg-green-600 px-3 py-1.5 text-white hover:bg-green-700"
        >
          Применить к выбранным
        </ConfirmButton>
        <ConfirmButton
          formAction={bulkDelete}
          message="Удалить отмеченные компании из базы? Действие необратимо."
          className="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
        >
          Удалить выбранные
        </ConfirmButton>
        <span className="text-xs text-gray-400">
          отметьте строки чекбоксами; «выделить все» — в шапке таблицы
        </span>
      </div>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2"><SelectAllCheckbox /></th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">ИНН</th>
              <th className="px-3 py-2">Регион</th>
              <th className="px-3 py-2">Год</th>
              <th className="px-3 py-2">Налог</th>
              <th className="px-3 py-2">ОКВЭД</th>
              <th className="px-3 py-2">Обороты, млн</th>
              <th className="px-3 py-2">Закуп, т.₽</th>
              <th className="px-3 py-2">Цена, т.₽</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">ЕГРЮЛ</th>
              <th className="px-3 py-2">Ист.</th>
              <th className="px-3 py-2">⚠</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((c) => (
              <tr key={String(c.id)} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input type="checkbox" name="ids" value={String(c.id)} />
                </td>
                <td className="px-3 py-2 text-gray-500">{String(c.id)}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/companies/${c.id}`} className="text-blue-600 hover:underline">
                    {String(c.name)}
                  </Link>
                </td>
                <td className="px-3 py-2">{String(c.inn ?? c.inn_raw ?? '—')}</td>
                <td className="px-3 py-2">{c.region_code ? REGION_NAMES[String(c.region_code)] ?? String(c.region_code) : String(c.city_raw ?? '—')}</td>
                <td className="px-3 py-2">{String(c.year_reg ?? c.year_raw ?? '—')}</td>
                <td className="px-3 py-2">{String(c.tax_system ?? '—')}</td>
                <td className="px-3 py-2 text-xs">
                  <OkvedCell okved={c.okved as string | null} egrulOkved={c.egrul_okved as string | null} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">
                  <TurnoverCell turnovers={c.turnovers as Record<string, number> | null} note={c.turnover_note as string | null} />
                </td>
                <td className="px-3 py-2">{String(c.buy_price_k ?? '—')}</td>
                <td className="px-3 py-2">
                  {c.price_k != null ? (
                    <>
                      {String(c.price_k)}
                      {c.price_note ? <span className="text-xs text-gray-500"> +{String(c.price_note)}</span> : null}
                    </>
                  ) : (
                    String(c.price_raw ?? '—')
                  )}
                </td>
                <td className="px-3 py-2"><StatusBadge status={String(c.status)} /></td>
                <td className="px-3 py-2">
                  {c.egrul_status ? <EgrulBadge status={String(c.egrul_status)} /> : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{String(c.source)}</td>
                <td className="px-3 py-2">{c.needs_review ? '⚠' : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-8 text-center text-gray-500">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </form>

      {total > 0 && (
        <form action={bulkSetStatusByFilter} className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm">
          {filters.q && <input type="hidden" name="f_q" value={filters.q} />}
          {filters.region && <input type="hidden" name="f_region" value={filters.region} />}
          {filters.status && <input type="hidden" name="f_status" value={filters.status} />}
          {filters.tax && <input type="hidden" name="f_tax" value={filters.tax} />}
          {filters.source && <input type="hidden" name="f_source" value={filters.source} />}
          {filters.needs_review === true && <input type="hidden" name="f_needs_review" value="true" />}
          {filters.turnover_min !== undefined && (
            <input type="hidden" name="f_turnover_min" value={String(filters.turnover_min)} />
          )}
          {filters.turnover_max !== undefined && (
            <input type="hidden" name="f_turnover_max" value={String(filters.turnover_max)} />
          )}
          {filters.price_min !== undefined && (
            <input type="hidden" name="f_price_min" value={String(filters.price_min)} />
          )}
          {filters.price_max !== undefined && (
            <input type="hidden" name="f_price_max" value={String(filters.price_max)} />
          )}
          <span className="text-xs text-gray-600">
            Применить ко ВСЕМ {total} компаниям под текущим фильтром (не только на этой странице):
          </span>
          <select name="target_status" defaultValue="verified" className="rounded border px-2 py-1">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ConfirmButton
            message={`Сменить статус у всех ${total} компаний под фильтром? Действие затронет все страницы.`}
            className="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
          >
            Применить ко всем {total}
          </ConfirmButton>
        </form>
      )}

      {pages > 1 && (
        <div className="flex gap-1 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
            const pqs = new URLSearchParams(qs);
            if (p > 1) pqs.set('page', String(p));
            return (
              <Link
                key={p}
                href={`/admin/companies${pqs.toString() ? `?${pqs}` : ''}`}
                className={`rounded border px-2 py-1 ${p === page ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** ОКВЭД: ручное значение приоритетнее данных ЕГРЮЛ; длинный текст — в подсказке. */
function OkvedCell({ okved, egrulOkved }: { okved: string | null; egrulOkved: string | null }) {
  const value = okved || egrulOkved;
  if (!value) return <span className="text-gray-400">—</span>;
  const short = value.length > 24 ? `${value.slice(0, 24)}…` : value;
  return <span title={value}>{short}</span>;
}

/** Обороты по годам компактно: «23: 92 · 24: 82,2 · 25: 50». */
function TurnoverCell({
  turnovers, note,
}: {
  turnovers: Record<string, number> | null; note: string | null;
}) {
  const years = Object.entries(turnovers ?? {})
    .filter(([y, v]) => /^\d{4}$/.test(y) && v !== null)
    .sort(([a], [b]) => Number(a) - Number(b));

  if (years.length === 0) {
    return <span className="text-gray-400" title={note ?? undefined}>{note ? `${note.slice(0, 18)}…` : '—'}</span>;
  }
  return (
    <span title={note ?? undefined}>
      {years.map(([y, v]) => `${y.slice(2)}: ${String(v).replace('.', ',')}`).join(' · ')}
    </span>
  );
}

function RangeFilter({
  label, nameMin, nameMax, min, max,
}: {
  label: string; nameMin: string; nameMax: string; min?: number; max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-1">
        <input
          name={nameMin}
          defaultValue={min ?? ''}
          placeholder="от"
          inputMode="decimal"
          className="w-16 rounded border px-2 py-1"
        />
        <span className="text-gray-400">—</span>
        <input
          name={nameMax}
          defaultValue={max ?? ''}
          placeholder="до"
          inputMode="decimal"
          className="w-16 rounded border px-2 py-1"
        />
      </div>
    </label>
  );
}

function Select({
  name, label, value, options,
}: {
  name: string; label: string; value?: string; options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <select name={name} defaultValue={value ?? ''} className="rounded border px-2 py-1">
        <option value="">—</option>
        {options.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}
