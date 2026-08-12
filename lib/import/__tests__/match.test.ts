import { describe, it, expect } from 'vitest';
import { buildUpdateChanges } from '../match';
import { NormalizedCompany } from '@/lib/normalize';

const base: NormalizedCompany = {
  name: null, inn: null, inn_raw: null, seller_contact: null,
  region_code: null, city_raw: null, year_reg: null, year_raw: null,
  turnover_note: null, turnover_last_m: null, turnovers: {},
  price_k: null, price_raw: null, buy_price_k: null,
  tax_system: null, tax_raw: null, extra: null,
  has_license: false, banks: null,
  needs_review: false, problems: [],
};

describe('buildUpdateChanges — правило «import never blanks» (раздел 13)', () => {
  it('пустая ячейка не затирает заполненное поле', () => {
    const existing = { name: 'ООО Ромашка', price_k: '100', region_code: 'msk' };
    const parsed = { ...base, name: 'ООО Ромашка', price_k: null, region_code: null };
    const changes = buildUpdateChanges(existing, parsed);
    expect(changes.price_k).toBeUndefined();
    expect(changes.region_code).toBeUndefined();
  });

  it('непустое новое значение попадает в diff old→new', () => {
    const existing = { name: 'ООО Ромашка', price_k: '100' };
    const parsed = { ...base, name: 'ООО Ромашка', price_k: 150 };
    const changes = buildUpdateChanges(existing, parsed);
    expect(changes.price_k).toEqual({ old: '100', new: 150 });
  });

  it('одинаковые значения не создают изменений (идемпотентность повторного импорта)', () => {
    const existing = {
      name: 'ООО Ромашка', inn: '1655123456', price_k: '100',
      year_reg: 2022, region_code: 'kzn', has_license: false,
    };
    const parsed = {
      ...base, name: 'ООО Ромашка', inn: '1655123456',
      price_k: 100, year_reg: 2022, region_code: 'kzn',
    };
    expect(buildUpdateChanges(existing, parsed)).toEqual({});
  });

  it('has_license: только установка в true, false не затирает', () => {
    const withTrue = buildUpdateChanges({ has_license: false }, { ...base, has_license: true });
    expect(withTrue.has_license).toEqual({ old: false, new: true });
    const withFalse = buildUpdateChanges({ has_license: true }, { ...base, has_license: false });
    expect(withFalse.has_license).toBeUndefined();
  });
});
