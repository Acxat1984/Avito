import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { REGION_NAMES } from '@/lib/normalize/regions';
import { StatusBadge, EgrulBadge } from '@/app/admin/ui';
import { updateCompany, archiveCompany, checkEgrul } from '../actions';
import { ExternalChecks } from '../external-checks';
import { CopyCardButton } from '../copy-card';
import { formatCompanyCard, CompanyLike } from '@/lib/format/company-card';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'verified', 'reserved', 'sold', 'archived'];
const TAXES = ['osno', 'usn6', 'usn_dr', 'ausn'];

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const [company] = await sql`select * from companies where id = ${companyId}`;
  if (!company) notFound();

  const [audit, lead, dialog] = await Promise.all([
    sql`select * from company_audit where company_id = ${companyId} order by id desc limit 50`,
    sql`select * from leads where company_id = ${companyId} order by id desc limit 1`,
    company.dialog_id
      ? sql`select * from dialogs where id = ${company.dialog_id}`
      : Promise.resolve([]),
  ]);

  // поля оборотов: 3 последних года + все годы, которые уже есть в карточке
  const turnovers = (company.turnovers ?? {}) as Record<string, number>;
  const currentYear = new Date().getFullYear();
  const turnoverYears = [
    ...new Set([
      ...Object.keys(turnovers).filter((y) => /^\d{4}$/.test(y)),
      String(currentYear - 2),
      String(currentYear - 1),
      String(currentYear),
    ]),
  ].sort();

  const update = updateCompany.bind(null, companyId);
  const archive = archiveCompany.bind(null, companyId);
  const egrulCheck = checkEgrul.bind(null, companyId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/companies" className="text-sm text-gray-500 hover:text-gray-900">← к списку</Link>
        <h1 className="text-xl font-semibold">#{companyId} {String(company.name)}</h1>
        <StatusBadge status={String(company.status)} />
        {Boolean(company.needs_review) && (
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">требует проверки</span>
        )}
        <span className="text-xs text-gray-400">источник: {String(company.source)}</span>
      </div>

      {company.source === 'avito_bot' && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
          Карточку создал бот.{' '}
          {dialog.length > 0 && (
            <Link href={`/admin/dialogs?id=${company.dialog_id}`} className="text-blue-700 underline">
              Диалог #{String(company.dialog_id)}
            </Link>
          )}{' '}
          {lead.length > 0 && (
            <Link href="/admin/leads" className="text-blue-700 underline">
              Лид #{String(lead[0].id)}
            </Link>
          )}
          <span className="ml-1 text-gray-600">
            Не попадает в подбор, пока статус не «verified».
          </span>
        </div>
      )}

      <CopyCardButton text={formatCompanyCard(company as unknown as CompanyLike)} />

      <section className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Данные ЕГРЮЛ</h2>
          {company.egrul_status && <EgrulBadge status={String(company.egrul_status)} />}
          {company.egrul_checked_at && (
            <span className="text-xs text-gray-400">
              проверено {new Date(String(company.egrul_checked_at)).toLocaleString('ru-RU')}
            </span>
          )}
          <form action={egrulCheck} className="ml-auto">
            <button
              disabled={!company.inn}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-40"
            >
              {company.egrul_checked_at ? 'Проверить снова' : 'Проверить по ИНН'}
            </button>
          </form>
        </div>
        {!company.inn && (
          <p className="mt-2 text-xs text-gray-500">
            Проверка недоступна: у карточки нет корректного ИНН (10 или 12 цифр).
          </p>
        )}
        {company.egrul_checked_at && (
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm md:grid-cols-2">
            <Row label="Официальное название" value={company.egrul_name} />
            <Row label="Дата регистрации" value={company.egrul_reg_date ? new Date(String(company.egrul_reg_date)).toLocaleDateString('ru-RU') : null} />
            <Row label="ОКВЭД" value={company.egrul_okved} />
            <Row label="Адрес" value={company.egrul_address} />
          </dl>
        )}
        {company.egrul_reg_date && company.year_reg &&
          new Date(String(company.egrul_reg_date)).getFullYear() !== Number(company.year_reg) && (
            <p className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-800">
              Расхождение: в карточке год {String(company.year_reg)}, по ЕГРЮЛ{' '}
              {new Date(String(company.egrul_reg_date)).getFullYear()}
            </p>
          )}

        <ExternalChecks inn={company.inn ? String(company.inn) : null} />
      </section>

      <form action={update} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="space-y-3 rounded border bg-white p-4">
          <h2 className="font-medium">Основное</h2>
          <Field label="Название" name="name" value={company.name} required />
          <Field label="ИНН (нормализованный)" name="inn" value={company.inn} raw={company.inn_raw} />
          <Field label="Контакт продавца (закрыто, INV-4)" name="seller_contact" value={company.seller_contact} />
          <label className="block text-sm">
            <span className="text-xs text-gray-500">Регион</span>
            <select name="region_code" defaultValue={String(company.region_code ?? '')} className="mt-1 w-full rounded border px-2 py-1.5">
              <option value="">—</option>
              {Object.entries(REGION_NAMES).map(([code, name]) => (
                <option key={code} value={code}>{name} ({code})</option>
              ))}
            </select>
            {company.city_raw != null && <RawNote raw={company.city_raw} />}
          </label>
          <Field label="Год регистрации" name="year_reg" value={company.year_reg} raw={company.year_raw} />
          <label className="block text-sm">
            <span className="text-xs text-gray-500">Налоговый режим</span>
            <select name="tax_system" defaultValue={String(company.tax_system ?? '')} className="mt-1 w-full rounded border px-2 py-1.5">
              <option value="">—</option>
              {TAXES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {company.tax_raw != null && <RawNote raw={company.tax_raw} />}
          </label>
        </section>

        <section className="space-y-3 rounded border bg-white p-4">
          <h2 className="font-medium">Финансы и прочее</h2>
          <div>
            <span className="text-xs text-gray-500">Обороты по годам, млн ₽</span>
            <input type="hidden" name="turnovers_present" value="1" />
            <div className="mt-1 flex flex-wrap gap-2">
              {turnoverYears.map((y) => (
                <label key={y} className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">{y}</span>
                  <input
                    name={`turnover_${y}`}
                    defaultValue={String(turnovers[y] ?? '')}
                    inputMode="decimal"
                    className="w-24 rounded border px-2 py-1.5"
                  />
                </label>
              ))}
            </div>
          </div>
          <Field label="Обороты (исходный текст)" name="turnover_note" value={company.turnover_note} />
          <Field label="Цена, тыс. ₽" name="price_k" value={company.price_k} raw={company.price_raw} />
          <Field label="Приписка к цене" name="price_note" value={company.price_note} />
          <Field label="Цена закупа, тыс. ₽" name="buy_price_k" value={company.buy_price_k} />
          <Field label="Адрес" name="address" value={company.address} />
          <Field label="ОКВЭД" name="okved" value={company.okved} />
          <Field label="Сотрудники" name="employees" value={company.employees} />
          <label className="block text-sm">
            <span className="text-xs text-gray-500">ЗСКА</span>
            <select name="zska" defaultValue={String(company.zska ?? '')} className="mt-1 w-full rounded border px-2 py-1.5">
              <option value="">—</option>
              {['зелёный', 'жёлтый', 'красный'].map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </label>
          <Field label="Дополнительно" name="extra" value={company.extra} textarea />
          <Field label="Банки" name="banks" value={company.banks} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="has_license" defaultChecked={Boolean(company.has_license)} />
            есть лицензия
          </label>
          <label className="block text-sm">
            <span className="text-xs text-gray-500">Статус (draft→verified — главное действие)</span>
            <select name="status" defaultValue={String(company.status)} className="mt-1 w-full rounded border px-2 py-1.5">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <Field label="Заметки проверки" name="review_notes" value={company.review_notes} textarea />
          {Boolean(company.needs_review) && (
            <label className="flex items-center gap-2 text-sm font-medium text-orange-700">
              <input type="checkbox" name="reviewed" />
              проверено — снять флаг «требует проверки»
            </label>
          )}
        </section>

        <div className="flex gap-2 md:col-span-2">
          <button className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Сохранить
          </button>
        </div>
      </form>

      {company.status !== 'archived' && (
        <form action={archive}>
          <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            В архив (вместо удаления)
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-2 font-medium">История изменений</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-gray-500">Изменений не было</p>
        ) : (
          <ul className="divide-y rounded border bg-white text-sm">
            {audit.map((a) => (
              <li key={String(a.id)} className="px-3 py-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{String(a.actor)}</span>
                  <span>{new Date(String(a.created_at)).toLocaleString('ru-RU')}</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(a.changes as Record<string, { old: unknown; new: unknown }>).map(([f, ch]) => (
                    <div key={f}>
                      <b>{f}</b>: <span className="text-gray-500">{fmt(ch.old)}</span> → {fmt(ch.new)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-gray-500">{label}:</dt>
      <dd>{String(value)}</dd>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  return String(v);
}

function RawNote({ raw }: { raw: unknown }) {
  return <span className="mt-0.5 block text-xs text-gray-400">raw: «{String(raw)}»</span>;
}

function Field({
  label, name, value, raw, required, textarea,
}: {
  label: string; name: string; value: unknown; raw?: unknown; required?: boolean; textarea?: boolean;
}) {
  const v = value === null || value === undefined ? '' : String(value);
  return (
    <label className="block text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      {textarea ? (
        <textarea name={name} defaultValue={v} rows={2} className="mt-1 w-full rounded border px-2 py-1.5" />
      ) : (
        <input name={name} defaultValue={v} required={required} className="mt-1 w-full rounded border px-2 py-1.5" />
      )}
      {raw !== null && raw !== undefined && <RawNote raw={raw} />}
    </label>
  );
}
