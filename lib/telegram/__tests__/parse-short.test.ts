import { describe, it, expect } from 'vitest';
import { parseShortInput } from '../parse-short';

describe('parseShortInput — краткий формат добавления', () => {
  it('всё в одной строке', () => {
    const r = parseShortInput('7328108216 89278250111 закуп 20 цена 100 альфа, офис');
    expect(r.inn).toBe('7328108216');
    expect(r.contact).toBe('89278250111');
    expect(r.buyPriceK).toBe(20);
    expect(r.priceK).toBe(100);
    expect(r.extra).toContain('альфа');
  });

  it('построчно с подписями', () => {
    const r = parseShortInput(
      'ИНН 7328108216\nтел +7 927 825-01-11\nзакуп 20\nцена продажи 100\nАльфа, есть долг 64тр',
    );
    expect(r.inn).toBe('7328108216');
    expect(r.contact).toMatch(/927/);
    expect(r.buyPriceK).toBe(20);
    expect(r.priceK).toBe(100);
    expect(r.extra).toContain('долг');
  });

  it('только ИНН', () => {
    const r = parseShortInput('5837083717');
    expect(r.inn).toBe('5837083717');
    expect(r.contact).toBeNull();
    expect(r.buyPriceK).toBeNull();
    expect(r.priceK).toBeNull();
  });

  it('ИНН ИП (12 цифр)', () => {
    expect(parseShortInput('165812345678 цена 50').inn).toBe('165812345678');
  });

  it('телефон не путается с ИНН', () => {
    const r = parseShortInput('89272229999 1655505607');
    expect(r.contact).toBe('89272229999');
    expect(r.inn).toBe('1655505607');
  });

  it('дробные цены через запятую', () => {
    const r = parseShortInput('1655505607 закуп 12,5 цена 87,5');
    expect(r.buyPriceK).toBe(12.5);
    expect(r.priceK).toBe(87.5);
  });

  it('нет ИНН — возвращает null', () => {
    expect(parseShortInput('просто текст без цифр').inn).toBeNull();
  });
});
