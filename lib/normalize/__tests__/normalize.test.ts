import { describe, it, expect } from 'vitest';
import { normalizeYear } from '../year';
import { normalizeInn } from '../inn';
import { normalizeRegion } from '../region';
import { normalizePrice } from '../price';
import { normalizeTax } from '../tax';
import { normalizeTurnover } from '../turnover';
import { normalizeExtra } from '../extra';

describe('normalizeYear (4.2)', () => {
  it('22 → 2022', () => {
    const r = normalizeYear('22');
    expect(r.value).toBe(2022);
    expect(r.needsReview).toBe(false);
  });
  it('2006 → 2006', () => {
    expect(normalizeYear('2006').value).toBe(2006);
  });
  it('08.24 → 2024', () => {
    expect(normalizeYear('08.24').value).toBe(2024);
  });
  it('15.03.23г → 2023', () => {
    expect(normalizeYear('15.03.23г').value).toBe(2023);
  });
  it('2021-09-27 00:00:00 → 2021', () => {
    expect(normalizeYear('2021-09-27 00:00:00').value).toBe(2021);
  });
  it('Date-объект из Excel → год', () => {
    expect(normalizeYear(new Date('2021-09-27T00:00:00Z')).value).toBe(2021);
  });
  it('5 → 2005', () => {
    expect(normalizeYear('5').value).toBe(2005);
  });
  it('99 → 1999', () => {
    expect(normalizeYear('99').value).toBe(1999);
  });
  it('мусор → null + review', () => {
    const r = normalizeYear('мусор');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.raw).toBe('мусор');
  });
  it('пусто → null без review', () => {
    const r = normalizeYear('');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(false);
  });
});

describe('normalizeInn (4.1)', () => {
  it('O600010917 → 0600010917 (10 цифр, валиден)', () => {
    const r = normalizeInn('O600010917');
    expect(r.value).toBe('0600010917');
    expect(r.needsReview).toBe(false);
  });
  it('По запросу → null без review, с пометкой', () => {
    const r = normalizeInn('По запросу');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(false);
    expect(r.problems).toContain('ИНН по запросу');
    expect(r.raw).toBe('По запросу');
  });
  it('264081370 (9 цифр) → null + review', () => {
    const r = normalizeInn('264081370');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.problems).toContain('ИНН нестандартной длины');
  });
  it('12 цифр (ИП) валиден', () => {
    expect(normalizeInn('165812345678').value).toBe('165812345678');
  });
  it('число из Excel', () => {
    expect(normalizeInn(1655123456).value).toBe('1655123456');
  });
});

describe('normalizeRegion (4.3)', () => {
  it("'Рт челны ' → rt", () => {
    expect(normalizeRegion('Рт челны ').value).toBe('rt');
  });
  it("'миас (челяб)' → chel", () => {
    expect(normalizeRegion('миас (челяб)').value).toBe('chel');
  });
  it("'йошка' → mari", () => {
    expect(normalizeRegion('йошка').value).toBe('mari');
  });
  it("'Мытищи' → null + review", () => {
    const r = normalizeRegion('Мытищи');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.problems[0]).toContain('город не распознан');
  });
  it('двойные пробелы схлопываются', () => {
    expect(normalizeRegion('рт   челны').value).toBe('rt');
  });
});

describe('normalizePrice (4.4)', () => {
  it("'100 (торг)' → 100", () => {
    expect(normalizePrice('100 (торг)').value).toBe(100);
  });
  it("'40 не хочет' → 40", () => {
    expect(normalizePrice('40 не хочет').value).toBe(40);
  });
  it("'Дог' → null без review", () => {
    const r = normalizePrice('Дог');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(false);
  });
  it('пусто → null', () => {
    expect(normalizePrice('').value).toBeNull();
  });
});

describe('normalizeTax (4.5)', () => {
  it("'0.06' → usn6", () => {
    expect(normalizeTax('0.06').value).toBe('usn6');
  });
  it('0.06 числом из Excel → usn6', () => {
    expect(normalizeTax(0.06).value).toBe('usn6');
  });
  it("'На осно готов' → osno", () => {
    expect(normalizeTax('На осно готов').value).toBe('osno');
  });
  it("'усн (с нг на ндс)' → usn6 + note, без review", () => {
    const r = normalizeTax('усн (с нг на ндс)');
    expect(r.value).toBe('usn6');
    expect(r.needsReview).toBe(false);
    expect(r.problems.join('; ')).toContain('с нг на ндс');
  });
  it("'усн (хотят на осно)' → режим по основному токену усн", () => {
    const r = normalizeTax('усн (хотят на осно)');
    expect(r.value).toBe('usn6');
    expect(r.problems.join('; ')).toContain('хотят на осно');
  });
  it("'Д-р' → usn_dr", () => {
    expect(normalizeTax('Д-р').value).toBe('usn_dr');
  });
  it("'усн д-р' → usn_dr", () => {
    expect(normalizeTax('усн д-р').value).toBe('usn_dr');
  });
  it("'усн доходы' → usn6", () => {
    expect(normalizeTax('усн доходы').value).toBe('usn6');
  });
  it("'усн' без уточнения → usn6 + заметка, без review", () => {
    const r = normalizeTax('усн');
    expect(r.value).toBe('usn6');
    expect(r.needsReview).toBe(false);
    expect(r.problems).toContain('УСН без уточнения, принят 6%');
  });
  it("'аусн' → ausn", () => {
    expect(normalizeTax('аусн').value).toBe('ausn');
  });
  it('мусор → null + review', () => {
    const r = normalizeTax('патент??');
    expect(r.value).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});

describe('normalizeTurnover (4.6)', () => {
  it("'23-4млн; 24-12млн' → 12 (последний год)", () => {
    const r = normalizeTurnover('23-4млн; 24-12млн');
    expect(r.value).toBe(12);
    expect(r.raw).toBe('23-4млн; 24-12млн');
  });
  it("'0' → null", () => {
    expect(normalizeTurnover('0').value).toBeNull();
  });
  it("'Мин' → null", () => {
    expect(normalizeTurnover('Мин').value).toBeNull();
  });
  it("'До 16г' → null", () => {
    expect(normalizeTurnover('До 16г').value).toBeNull();
  });
  it('review не ставится при ошибке', () => {
    expect(normalizeTurnover('непонятно').needsReview).toBe(false);
  });
});

describe('normalizeExtra (4.7)', () => {
  it('конкатенация дополнительно + Unnamed через ;', () => {
    const r = normalizeExtra('счета сбер, альфа', ['есть лицензия', null, '']);
    expect(r.extra).toBe('счета сбер, альфа; есть лицензия');
    expect(r.has_license).toBe(true);
    expect(r.banks).toBe('Сбер, Альфа');
  });
  it('т-банк → Тинькофф', () => {
    expect(normalizeExtra('счёт в т-банк').banks).toBe('Тинькофф');
  });
  it('пусто', () => {
    const r = normalizeExtra(null, []);
    expect(r.extra).toBeNull();
    expect(r.has_license).toBe(false);
    expect(r.banks).toBeNull();
  });
});
