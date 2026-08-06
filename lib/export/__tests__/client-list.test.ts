import { describe, it, expect } from 'vitest';
import { formatClientListText, ClientRow } from '../client-list';
import { violatesInv2 } from '@/lib/dialog/state';

const rows: ClientRow[] = [
  {
    'ID': 42, 'Регион': 'Татарстан', 'Год регистрации': '2021',
    'Налоговый режим': 'УСН 6%', 'Обороты': '~12 млн/год',
    'Лицензия': 'есть', 'Цена': 'обсуждается',
  },
  {
    'ID': 77, 'Регион': 'Москва и МО', 'Год регистрации': '2006',
    'Налоговый режим': 'ОСНО', 'Обороты': 'уточняются',
    'Лицензия': '—', 'Цена': 'обсуждается',
  },
];

describe('Клиентский список — INV-4 (белый список полей)', () => {
  const text = formatClientListText(rows);

  it('содержит только разрешённые данные', () => {
    expect(text).toContain('Татарстан');
    expect(text).toContain('2021');
    expect(text).toContain('УСН 6%');
    expect(text).toContain('цена обсуждается');
  });

  it('содержит ID карточек — по ним идёт общение с клиентом', () => {
    expect(text).toContain('№ 42');
    expect(text).toContain('№ 77');
  });

  it('не содержит названий, ИНН и прочих закрытых данных', () => {
    expect(text).not.toMatch(/инн|ооо\s/i);
    expect(text).not.toMatch(/\b\d{10}\b/);
  });

  it('проходит фильтр INV-2 (нет ссылок, телефонов, цен)', () => {
    expect(violatesInv2(text)).toBeNull();
  });

  it('пустой список даёт корректный текст', () => {
    expect(formatClientListText([])).toContain('нет подходящих вариантов');
  });

  it('ID не путается с телефоном и не ломает INV-2', () => {
    const long = formatClientListText([{ ...rows[0], ID: 1234567 }]);
    expect(violatesInv2(long)).toBeNull();
  });
});
