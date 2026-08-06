import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const wb = XLSX.read(readFileSync('C:/avito/111.xlsx'), { type: 'buffer', cellDates: true });
console.log('Листы:', wb.SheetNames.join(' | '));

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  console.log(`\n===== ЛИСТ «${sheetName}»: строк ${rows.length} =====`);
  console.log('Заголовки:', JSON.stringify(rows[0]));

  // сколько непустых строк
  const nonEmpty = rows.slice(1).filter((r) => (r ?? []).some((c) => c !== null && String(c).trim() !== ''));
  console.log(`Непустых строк данных: ${nonEmpty.length}`);

  console.log('\n--- первые 6 строк ---');
  for (let i = 1; i <= Math.min(6, rows.length - 1); i++) {
    console.log(`${i}: ${JSON.stringify(rows[i])}`);
  }
  console.log('\n--- последние 4 строки ---');
  for (let i = Math.max(1, rows.length - 4); i < rows.length; i++) {
    console.log(`${i}: ${JSON.stringify(rows[i])}`);
  }

  // заполненность по колонкам
  const headers = (rows[0] ?? []).map((h, i) => h ?? `<кол.${i}>`);
  console.log('\n--- заполненность колонок ---');
  headers.forEach((h, ci) => {
    const filled = nonEmpty.filter((r) => r[ci] !== null && String(r[ci]).trim() !== '').length;
    const samples = nonEmpty
      .map((r) => r[ci])
      .filter((v) => v !== null && String(v).trim() !== '')
      .slice(0, 3)
      .map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).slice(0, 30));
    console.log(`  [${ci}] ${String(h).padEnd(22)} — ${filled}/${nonEmpty.length} | примеры: ${samples.join(' ; ')}`);
  });
}
