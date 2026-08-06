import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const wb = XLSX.read(readFileSync('C:/avito/111.xlsx'), { type: 'buffer', cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Лист1'], { header: 1, defval: null });
const data = rows.slice(1).filter((r) => (r ?? []).some((c) => c !== null && String(c).trim() !== ''));

const H = ['название','инн','продавец','23','24','25','26','цена закупа','цена','налог','город','год','дополнительно','код деятельности'];
const uniq = (ci) => [...new Set(data.map((r) => r[ci]).filter((v) => v !== null && String(v).trim() !== '').map(String))];

console.log('=== ВСЕ 35 СТРОК ===');
data.forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${String(r[0]).padEnd(16)} | ИНН ${r[1]} | 23:${r[3]} 24:${r[4]} 25:${r[5]} 26:${r[6]} | закуп:${r[7]} цена:${r[8]} | ${r[9]} | ${r[10]} | год:${r[11]} | ${r[12] ?? ''}`);
});

console.log('\n=== УНИКАЛЬНЫЕ ЗНАЧЕНИЯ ПО КОЛОНКАМ ===');
for (const ci of [3, 4, 5, 6]) {
  console.log(`обороты ${H[ci]}: ${uniq(ci).join(' | ')}`);
}
console.log(`\nцена закупа: ${uniq(7).join(' | ')}`);
console.log(`цена: ${uniq(8).join(' | ')}`);
console.log(`\nналог: ${uniq(9).join(' | ')}`);
console.log(`\nгород: ${uniq(10).join(' | ')}`);
console.log(`\nгод: ${uniq(11).join(' | ')}`);
console.log(`\nдополнительно: ${uniq(12).join(' | ')}`);
console.log(`\nкод деятельности: ${uniq(13).join(' | ')}`);

// ИНН длины
const badInn = data.filter((r) => String(r[1]).replace(/\D/g, '').length !== 10 && String(r[1]).replace(/\D/g, '').length !== 12);
console.log(`\nИНН нестандартной длины: ${badInn.length ? badInn.map((r) => `${r[0]}=${r[1]}`).join(', ') : 'нет'}`);
