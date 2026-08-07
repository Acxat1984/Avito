import Link from 'next/link';
import { REGION_NAMES } from '@/lib/normalize/regions';
import { createCompany, createCompanyQuick } from '../actions';

const TAXES: Array<[string, string]> = [
  ['osno', 'ОСНО'],
  ['usn6', 'УСН 6%'],
  ['usn_dr', 'УСН доходы-расходы'],
  ['ausn', 'АУСН'],
];

const CURRENT_YEAR = new Date().getFullYear();
// четыре года: три завершённых + текущий
const TURNOVER_YEARS = [CURRENT_YEAR - 3, CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];

const MODES = [
  { key: 'quick', label: '⚡ Быстро по ИНН', hint: 'данные подтянутся из ЕГРЮЛ' },
  { key: 'full', label: '📝 Полная форма', hint: 'все поля вручную' },
] as const;

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mode = sp.mode === 'full' ? 'full' : 'quick';

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin/companies" className="text-sm text-gray-500 hover:text-gray-900">
        ← к списку
      </Link>
      <h1 className="text-xl font-semibold">Новая компания</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        {MODES.map((m) => (
          <Link
            key={m.key}
            href={`/admin/companies/new?mode=${m.key}`}
            className={`rounded border px-3 py-2 ${
              mode === m.key ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'
            }`}
          >
            {m.label}
            <span className={`ml-2 text-xs ${mode === m.key ? 'text-blue-100' : 'text-gray-500'}`}>
              {m.hint}
            </span>
          </Link>
        ))}
        <Link
          href="/admin/paste"
          className="rounded border bg-white px-3 py-2 hover:bg-gray-100"
        >
          💬 Из переписки
          <span className="ml-2 text-xs text-gray-500">разбор текста нейросетью</span>
        </Link>
      </div>

      {mode === 'quick' ? <QuickForm /> : <FullForm />}
    </div>
  );
}

function QuickForm() {
  return (
    <form action={createCompanyQuick} className="space-y-4 text-sm">
      <section className="grid grid-cols-1 gap-3 rounded border bg-white p-4 md:grid-cols-2">
        <p className="text-xs text-gray-600 md:col-span-2">
          Укажите только эти поля — название, год регистрации, регион, адрес и ОКВЭД платформа
          возьмёт из ЕГРЮЛ по ИНН. Налоговый режим и обороты нужно будет дозаполнить в карточке.
        </p>
        <Field name="inn" label="ИНН *" required placeholder="7328108216" inputMode="numeric" />
        <Field name="seller_contact" label="Контактный телефон" placeholder="+7 999 123-45-67" />
        <Field name="buy_price_k" label="Цена закупа, тыс ₽" placeholder="20" inputMode="decimal" />
        <Field name="price_k" label="Цена продажи, тыс ₽" placeholder="100" inputMode="decimal" />
        <label className="md:col-span-2">
          <span className="text-xs text-gray-500">Дополнительная информация</span>
          <textarea
            name="extra"
            rows={3}
            placeholder="банки, долги, лицензии, причина продажи…"
            className="mt-1 w-full rounded border px-2 py-1.5"
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Создать по ИНН
        </button>
        <span className="text-xs text-gray-500">
          Карточка создаётся черновиком и помечается «требует проверки»
        </span>
      </div>
    </form>
  );
}

function FullForm() {
  return (
    <form action={createCompany} className="space-y-4 text-sm">
      <section className="grid grid-cols-1 gap-3 rounded border bg-white p-4 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Основное</h2>
        <Field name="name" label="Название *" required placeholder="АРТСТРОЙ" />
        <Field name="inn" label="ИНН" placeholder="6316269619" inputMode="numeric" />
        <Field name="seller_contact" label="Контактный телефон" placeholder="+7 999 123-45-67" />
        <Field name="year_reg" label="Год регистрации" placeholder="2020" inputMode="numeric" />
        <Select name="region_code" label="Регион" options={Object.entries(REGION_NAMES)} />
        <Select name="tax_system" label="Налогообложение" options={TAXES} />
      </section>

      <section className="grid grid-cols-1 gap-3 rounded border bg-white p-4 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Деньги</h2>
        <Field name="buy_price_k" label="Цена закупа, тыс ₽" placeholder="200" inputMode="decimal" />
        <Field name="price_k" label="Цена продажи, тыс ₽" placeholder="300" inputMode="decimal" />
        <div className="md:col-span-2">
          <span className="text-xs text-gray-500">Обороты по годам, млн ₽</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {TURNOVER_YEARS.map((y) => (
              <label key={y} className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">{y}</span>
                <input
                  name={`turnover_${y}`}
                  placeholder="0"
                  inputMode="decimal"
                  className="w-24 rounded border px-2 py-1.5"
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded border bg-white p-4 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Прочее</h2>
        <Field name="address" label="Адрес" placeholder="г. Самара (офис)" />
        <Field name="okved" label="ОКВЭД" placeholder="43.39 Производство отделочных работ" />
        <Field name="employees" label="Сотрудники" placeholder="7" inputMode="numeric" />
        <Field name="banks" label="Р/С (банки)" placeholder="Альфа" />
        <Select
          name="zska"
          label="ЗСКА"
          options={[['зелёный', 'зелёный'], ['жёлтый', 'жёлтый'], ['красный', 'красный']]}
        />
        <label className="flex items-center gap-2 pt-5">
          <input type="checkbox" name="has_license" />
          есть лицензия
        </label>
        <label className="md:col-span-2">
          <span className="text-xs text-gray-500">Дополнительная информация</span>
          <textarea
            name="extra"
            rows={3}
            placeholder="долги, суды, блокировки, причина продажи…"
            className="mt-1 w-full rounded border px-2 py-1.5"
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Создать карточку
        </button>
        <span className="text-xs text-gray-500">
          Карточка создаётся черновиком — клиентам не показывается, пока не переведёте в «verified»
        </span>
      </div>
    </form>
  );
}

function Field({
  name, label, required, placeholder, inputMode,
}: {
  name: string; label: string; required?: boolean; placeholder?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 w-full rounded border px-2 py-1.5"
      />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: Array<[string, string]> }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <select name={name} defaultValue="" className="mt-1 w-full rounded border px-2 py-1.5">
        <option value="">—</option>
        {options.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}
