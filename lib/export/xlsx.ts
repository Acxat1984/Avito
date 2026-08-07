import * as XLSX from 'xlsx';
import { CompanyFilters, queryCompaniesAll } from '@/lib/db/queries';

/**
 * Раздел 6. Экспорт в формате, привычном заказчику: те же заголовки, что во
 * входном файле + служебные. Экспорт полный (raw-поля) — скачивает владелец.
 * НИКОГДА не встраивать в ответы бота (INV-4).
 */
const STATUS_RU: Record<string, string> = {
  draft: 'черновик',
  verified: 'проверена',
  reserved: 'резерв',
  sold: 'продана',
  archived: 'архив',
};
const SOURCE_RU: Record<string, string> = {
  import: 'импорт',
  avito_bot: 'бот avito',
  manual: 'вручную',
  quick: 'по ИНН (ЕГРЮЛ)',
  telegram: 'telegram-бот',
};

function toExportRow(c: Record<string, unknown>): Record<string, unknown> {
  return {
    'название и инн': c.name,
    'инн': c.inn ?? c.inn_raw,
    'продавец, тел': c.seller_contact,
    'обороты': c.turnover_note,
    'цена закупа': c.buy_price_k,
    'цена': c.price_raw ?? c.price_k,
    'система налог': c.tax_raw ?? c.tax_system,
    'город': c.city_raw,
    'год': c.year_raw ?? c.year_reg,
    'оквэд': c.okved ?? c.egrul_okved,
    'дополнительно': c.extra,
    'статус': STATUS_RU[String(c.status)] ?? c.status,
    'источник': SOURCE_RU[String(c.source)] ?? c.source,
    'требует проверки': c.needs_review ? 'да' : '',
    'id': c.id,
  };
}

export async function exportCompanies(
  filters: CompanyFilters,
  format: 'xlsx' | 'csv',
): Promise<{ body: Uint8Array | string; contentType: string; filename: string }> {
  const companies = await queryCompaniesAll(filters);
  const rows = companies.map(toExportRow);
  const ws = XLSX.utils.json_to_sheet(rows);
  const date = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      body: '﻿' + XLSX.utils.sheet_to_csv(ws), // BOM для Excel
      contentType: 'text/csv; charset=utf-8',
      filename: `companies_${date}.csv`,
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    body: new Uint8Array(out),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `companies_${date}.xlsx`,
  };
}
