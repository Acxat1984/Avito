import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const wb = XLSX.read(readFileSync('C:/avito/11.xlsx'), { type: 'buffer', cellDates: true });
console.log('Листы:', wb.SheetNames.join(', '));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
console.log('Всего строк (включая заголовок):', rows.length);
console.log('Заголовки:', JSON.stringify(rows[0]));
const show = (i) => {
  const r = rows[i] ?? [];
  console.log(`строка ${i}:`, JSON.stringify(r.slice(0, 4)));
};
// первые 3 строки данных и зона границы 30..40
for (const i of [1, 2, 3, 30, 31, 32, 33, 34, 35, 36, 37, 38]) show(i);
console.log('--- поиск ТРАНСРУ и Каскад ---');
rows.forEach((r, i) => {
  const joined = (r ?? []).map((c) => String(c ?? '')).join(' | ');
  if (/трансру/i.test(joined)) console.log(`ТРАНСРУ в строке ${i}: ${joined.slice(0, 120)}`);
  if (/каскад/i.test(joined)) console.log(`Каскад в строке ${i}: ${joined.slice(0, 120)}`);
});
console.log('последняя строка данных:', JSON.stringify((rows[rows.length - 1] ?? []).slice(0, 4)));
