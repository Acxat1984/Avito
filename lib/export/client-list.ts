import * as XLSX from 'xlsx';
import { CompanyFilters, queryCompaniesAll } from '@/lib/db/queries';
import { regionName } from '@/lib/normalize/regions';
import { lastFullYearTurnover, ru } from '@/lib/format/company-card';

/**
 * Выгрузка списка ООО ДЛЯ КЛИЕНТА (INV-4).
 * Белый список полей: регион текстом, год, налоговый режим, обороты, лицензия.
 * Никогда: название, ИНН, контакты продавца, цена числом.
 * Только status = 'verified'.
 */

const TAX_NAMES: Record<string, string> = {
  osno: 'ОСНО',
  usn6: 'УСН 6%',
  usn_dr: 'УСН доходы-расходы',
  ausn: 'АУСН',
};

export interface ClientRow {
  /** ID карточки — единый идентификатор для общения с клиентом */
  'ID': number;
  'Регион': string;
  'Год регистрации': string;
  'Налоговый режим': string;
  'Обороты': string;
  'Лицензия': string;
  'Цена': string;
}

function toClientRows(companies: Record<string, unknown>[]): ClientRow[] {
  return companies.map((c) => {
    // берём последний завершённый год: текущий неполный занижает обороты
    const turn = lastFullYearTurnover(c.turnovers as Record<string, number> | null);
    return {
      'ID': Number(c.id),
      'Регион': regionName(c.region_code as string | null) ?? 'уточняется',
      'Год регистрации': c.year_reg ? String(c.year_reg) : 'уточняется',
      'Налоговый режим': c.tax_system ? TAX_NAMES[String(c.tax_system)] ?? String(c.tax_system) : 'уточняется',
      'Обороты': turn ? `${turn.year}: ${ru(turn.value)} млн` : 'уточняются',
      'Лицензия': c.has_license ? 'есть' : '—',
      'Цена': 'обсуждается',
    };
  });
}

/** Всегда принудительно только verified — фильтр статуса из UI игнорируется. */
export async function getClientList(filters: CompanyFilters): Promise<ClientRow[]> {
  const companies = await queryCompaniesAll({ ...filters, status: 'verified' });
  return toClientRows(companies);
}

/** Тот же список + внутренние данные для владельца (ключ соответствия позиций). */
export async function getClientListWithKey(
  filters: CompanyFilters,
): Promise<{ rows: ClientRow[]; key: Array<{ pos: number; id: number; name: string; inn: string | null }> }> {
  const companies = await queryCompaniesAll({ ...filters, status: 'verified' });
  return {
    rows: toClientRows(companies),
    key: companies.map((c, i) => ({
      pos: i + 1,
      id: Number(c.id),
      name: String(c.name),
      inn: (c.inn as string | null) ?? (c.inn_raw as string | null) ?? null,
    })),
  };
}

export async function exportClientList(
  filters: CompanyFilters,
): Promise<{ body: Uint8Array; filename: string; contentType: string }> {
  const rows = await getClientList(filters);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Варианты');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    body: new Uint8Array(out),
    filename: `varianty_${new Date().toISOString().slice(0, 10)}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/**
 * Тот же список текстом — для копипаста прямо в чат Avito.
 * Каждая позиция помечена ID карточки: клиент отвечает «интересует № 223»,
 * владелец сразу открывает /admin/companies/223.
 */
export function formatClientListText(rows: ClientRow[]): string {
  if (rows.length === 0) return 'По вашим параметрам сейчас нет подходящих вариантов.';
  const lines = rows.map((r) => {
    const parts = [r['Регион'], `регистрация ${r['Год регистрации']}`, r['Налоговый режим']];
    if (r['Обороты'] !== 'уточняются') parts.push(`оборот ${r['Обороты']}`);
    if (r['Лицензия'] === 'есть') parts.push('есть лицензия');
    parts.push('цена обсуждается');
    return `№ ${r['ID']} — ${parts.join(', ')}`;
  });
  return `Доступные варианты:\n${lines.join('\n')}\n\nНапишите номер интересующего варианта — специалист расскажет детали.`;
}
