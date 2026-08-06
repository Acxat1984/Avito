import { describe, it, expect } from 'vitest';
import { Anonymizer } from '../anonymize';

describe('Anonymizer — обезличивание перед LLM', () => {
  it('телефоны маскируются (все форматы)', () => {
    const a = new Anonymizer();
    const masked = a.mask('звоните +7 903 056-07-56 или 89030560756');
    expect(masked).not.toMatch(/\d{5,}/);
    expect(masked).toContain('[PHONE_1]');
  });

  it('ИНН 10 и 12 цифр маскируются', () => {
    const a = new Anonymizer();
    const masked = a.mask('ИНН 5257215712, ИП с ИНН 165812345678');
    expect(masked).not.toContain('5257215712');
    expect(masked).not.toContain('165812345678');
    expect(masked).toContain('[INN_1]');
    expect(masked).toContain('[INN_2]');
  });

  it('email, ссылки и handles маскируются', () => {
    const a = new Anonymizer();
    const masked = a.mask('пишите на mail@firm.ru, сайт https://firm.ru, тг @someuser');
    expect(masked).not.toContain('mail@firm.ru');
    expect(masked).not.toContain('https://firm.ru');
    expect(masked).not.toContain('@someuser');
  });

  it('обратная подстановка восстанавливает оригиналы в extracted', () => {
    const a = new Anonymizer();
    a.mask('ИНН 5257215712, тел +79030560756');
    const extracted = a.unmaskDeep({ inn: '[INN_1]', contact: '[PHONE_1]', city: 'Казань' });
    expect(extracted.inn).toBe('5257215712');
    expect(extracted.contact).toBe('+79030560756');
    expect(extracted.city).toBe('Казань');
  });

  it('одинаковое значение получает один плейсхолдер', () => {
    const a = new Anonymizer();
    const masked = a.mask('ИНН 5257215712 повторю: 5257215712');
    expect(masked.match(/\[INN_1\]/g)?.length).toBe(2);
    expect(a.maskedCount).toBe(1);
  });

  it('бизнес-текст без ПД не искажается', () => {
    const a = new Anonymizer();
    const text = 'ООО на УСН 6%, Казань, 2021 год, обороты 23-4млн; 24-12млн, цена 100 тыс';
    expect(a.mask(text)).toBe(text);
  });
});
