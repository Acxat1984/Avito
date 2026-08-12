import * as XLSX from 'xlsx';
import { CompanyFilters, queryCompaniesAll } from '@/lib/db/queries';
import { regionName } from '@/lib/normalize/regions';

/**
 * Раздел 6. Экспорт базы для владельца — рабочие поля карточки.
 * Два режима: `full` (с телефоном продавца и ценой закупа) и `nocontacts`
 * (то же самое, но эти две колонки не попадают в файл — такой файл можно
 * передать партнёру). Используется и админкой, и Telegram-ботом.
 *
 * Служебные поля (статус, источник, отметки проверки и данные ЕГРЮЛ)
 * в выгрузку не идут: они нужны только внутри админки.
 */

export type ExportMode = 'full' | 'nocontacts';

const TAX_RU: Record<string, string> = {
  osno: 'ОСНО',
  usn6: 'УСН 6%',
  usn_dr: 'УСН доходы-расходы',
  ausn: 'АУСН',
};

/** «22.5» → «22,5»: привычный десятичный разделитель. */
function num(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace('.', ',');
}

/**
 * Строка экспорта. Порядок колонок — по важности при работе с таблицей:
 * сначала название, ИНН и телефон продавца, затем деньги, в самом конце
 * второстепенные ОКВЭД и адрес. Обороты по годам разворачиваются в
 * отдельные колонки, их состав вычисляется по всей выборке.
 */
function toExportRow(
  c: Record<string, unknown>,
  years: string[],
  mode: ExportMode,
): Record<string, unknown> {
  const turnovers = (c.turnovers ?? {}) as Record<string, unknown>;
  const row: Record<string, unknown> = { 'ID': c.id, 'Название': c.name, 'ИНН': c.inn ?? c.inn_raw };

  // телефон продавца — сразу за названием, но только в полной выгрузке
  if (mode === 'full') row['Телефон продавца'] = c.seller_contact ?? '';

  row['Регион'] = regionName(c.region_code as string | null) ?? c.city_raw ?? '';
  row['Год создания'] = c.year_reg ?? c.year_raw ?? '';
  row['Система налогообложения'] = c.tax_system
    ? TAX_RU[String(c.tax_system)] ?? c.tax_system
    : c.tax_raw ?? '';
  row['Расчётный счёт (банки)'] = c.banks ?? '';

  for (const y of years) row[`Обороты ${y}, млн`] = num(turnovers[y]);

  row['Цена продажи, тыс ₽'] = num(c.price_k ?? c.price_raw);
  if (mode === 'full') row['Цена закупа, тыс ₽'] = num(c.buy_price_k);

  row['ЗСКА'] = c.zska ?? '';
  row['Дополнительно'] = c.extra ?? '';

  // второстепенное — в конец, чтобы длинные тексты не мешали читать таблицу
  row['ОКВЭД'] = c.okved ?? c.egrul_okved ?? '';
  row['Адрес'] = c.address ?? c.egrul_address ?? '';

  return row;
}

/** Ширина колонок Excel: имя → символов. Для остальных — по умолчанию. */
const COLUMN_WIDTH: Record<string, number> = {
  'ID': 6,
  'ИНН': 15,
  'Название': 38,
  'Телефон продавца': 20,
  'Регион': 20,
  'Год создания': 13,
  'Система налогообложения': 22,
  'Расчётный счёт (банки)': 20,
  'Цена продажи, тыс ₽': 18,
  'Цена закупа, тыс ₽': 18,
  'ЗСКА': 10,
  'Дополнительно': 45,
  'ОКВЭД': 45,
  'Адрес': 55,
};

export async function exportCompanies(
  filters: CompanyFilters,
  format: 'xlsx' | 'csv',
  mode: ExportMode = 'full',
): Promise<{ body: Uint8Array | string; contentType: string; filename: string }> {
  const companies = await queryCompaniesAll(filters);

  // колонки оборотов: все годы, встреченные в выборке, по возрастанию
  const years = [
    ...new Set(
      companies.flatMap((c) =>
        Object.keys((c.turnovers ?? {}) as Record<string, unknown>).filter((y) => /^\d{4}$/.test(y)),
      ),
    ),
  ].sort();

  const rows = companies.map((c) => toExportRow(c, years, mode));
  const ws = XLSX.utils.json_to_sheet(rows);

  // ширина колонок: узкие столбцы скрывали бы ИНН, название и телефон
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  ws['!cols'] = headers.map((h) => ({ wch: COLUMN_WIDTH[h] ?? (h.startsWith('Обороты') ? 15 : 16) }));

  const date = new Date().toISOString().slice(0, 10);
  const suffix = mode === 'nocontacts' ? '_bez_kontaktov' : '';

  if (format === 'csv') {
    return {
      body: '﻿' + XLSX.utils.sheet_to_csv(ws), // BOM для Excel
      contentType: 'text/csv; charset=utf-8',
      filename: `companies_${date}${suffix}.csv`,
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Компании');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    body: new Uint8Array(out),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `companies_${date}${suffix}.xlsx`,
  };
}
