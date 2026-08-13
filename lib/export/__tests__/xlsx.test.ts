import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

/** Одна фиктивная компания со всеми заполненными полями. */
const company = {
  id: 42,
  name: 'ООО «Ромашка»',
  inn: '7707083893',
  seller_contact: '+7 927 000-11-22',
  region_code: 'rt',
  year_reg: 2019,
  tax_system: 'usn6',
  banks: 'Альфа',
  turnovers: { '2024': 12.5, '2025': 30 },
  price_k: 300,
  buy_price_k: 120,
  zska: 'зелёный',
  extra: 'долгов нет',
  status: 'verified',
  source: 'quick',
  needs_review: false,
  egrul_status: 'ACTIVE',
  egrul_checked_at: '2026-08-01T00:00:00Z',
  created_at: '2026-08-05T00:00:00Z',
  okved: '69.10 Деятельность в области права',
  address: 'г Казань, ул Баумана, д 1, офис 5',
  employees: 7,
  has_license: true,
};

vi.mock('@/lib/db/queries', () => ({
  queryCompaniesAll: async () => [company],
}));

const { exportCompanies } = await import('../xlsx');

/** Заголовки и ширины колонок из сгенерированного файла. */
async function sheetOf(mode: 'full' | 'nocontacts') {
  const { body } = await exportCompanies({}, 'xlsx', mode);
  // cellStyles нужен, чтобы SheetJS восстановил ширины колонок из файла
  const wb = XLSX.read(body as Uint8Array, { type: 'array', cellStyles: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
  return {
    headers: rows[0] as unknown as string[],
    widths: ((ws['!cols'] ?? []) as Array<{ wch?: number }>).map((c) => c?.wch),
    data: XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)[0],
  };
}

describe('экспорт компаний в Excel', () => {
  it('главное — в начале: ID, название, ИНН, телефон', async () => {
    const { headers } = await sheetOf('full');
    expect(headers.slice(0, 4)).toEqual(['ID', 'Название', 'ИНН', 'Телефон продавца']);
  });

  it('служебные колонки в выгрузку не идут', async () => {
    for (const mode of ['full', 'nocontacts'] as const) {
      const { headers } = await sheetOf(mode);
      for (const col of ['Статус', 'Источник', 'Требует проверки', 'Статус ЕГРЮЛ', 'Проверено ЕГРЮЛ', 'Добавлена', 'Дополнительно']) {
        expect(headers, `${mode}: ${col}`).not.toContain(col);
      }
    }
  });

  it('второстепенное — в конце: ОКВЭД и адрес', async () => {
    for (const mode of ['full', 'nocontacts'] as const) {
      const { headers } = await sheetOf(mode);
      expect(headers.slice(-2), mode).toEqual(['ОКВЭД', 'Адрес']);
    }
  });

  it('колонки «Сотрудники» и «Лицензия» убраны', async () => {
    for (const mode of ['full', 'nocontacts'] as const) {
      const { headers } = await sheetOf(mode);
      expect(headers, mode).not.toContain('Сотрудники');
      expect(headers, mode).not.toContain('Лицензия');
    }
  });

  it('режим nocontacts не содержит телефон и цену закупа', async () => {
    const { headers, data } = await sheetOf('nocontacts');
    expect(headers).not.toContain('Телефон продавца');
    expect(headers).not.toContain('Цена закупа, тыс ₽');
    // при этом остальные данные на месте
    expect(headers).toContain('Цена продажи, тыс ₽');
    expect(data['Название']).toBe('ООО «Ромашка»');
    expect(String(data['ИНН'])).toBe('7707083893');
  });

  it('обороты разворачиваются в колонки по годам', async () => {
    const { headers, data } = await sheetOf('full');
    expect(headers).toContain('Обороты 2024, млн');
    expect(headers).toContain('Обороты 2025, млн');
    expect(String(data['Обороты 2024, млн'])).toBe('12,5');
  });

  it('сырой текст продавца в файл не попадает, но данные из него — да', async () => {
    const { headers, data } = await sheetOf('full');
    expect(headers).not.toContain('Дополнительно');
    // банки и обороты, разобранные из того же текста, на месте
    expect(data['Расчётный счёт (банки)']).toBe('Альфа');
    expect(String(data['Обороты 2025, млн'])).toBe('30');
  });

  it('колонкам задана ширина — данные видно без ручной подгонки', async () => {
    const { headers, widths } = await sheetOf('full');
    expect(widths).toHaveLength(headers.length);
    expect(widths.every((w) => typeof w === 'number' && w >= 6)).toBe(true);
    // ключевые поля шире прочих
    expect(widths[headers.indexOf('Название')]).toBeGreaterThanOrEqual(30);
    expect(widths[headers.indexOf('ИНН')]).toBeGreaterThanOrEqual(14);
    expect(widths[headers.indexOf('Телефон продавца')]).toBeGreaterThanOrEqual(18);
  });

  it('в csv тот же состав колонок', async () => {
    const { body } = await exportCompanies({}, 'csv', 'nocontacts');
    const header = String(body).split('\n')[0].replace(/^﻿/, '');
    expect(header).toContain('ИНН');
    expect(header).not.toContain('Сотрудники');
    expect(header.trim().endsWith('Адрес')).toBe(true);
  });
});
