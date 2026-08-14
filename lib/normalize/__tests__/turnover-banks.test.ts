import { describe, it, expect } from 'vitest';
import { normalizeTurnover, parseTurnoversByYear, extractTurnovers } from '../turnover';
import { normalizeExtra, findBanks } from '../extra';
import { parseShortInput } from '@/lib/telegram/parse-short';

describe('обороты раскладываются по годам', () => {
  it('краткий формат продавцов: 23-4млн; 24-12млн', () => {
    expect(parseTurnoversByYear('23-4млн; 24-12млн')).toEqual({ '2023': 4, '2024': 12 });
  });

  it('четырёхзначные годы и слово «год»', () => {
    expect(parseTurnoversByYear('2023 год - 92 млн, 2024 год - 82,2 млн')).toEqual({
      '2023': 92,
      '2024': 82.2,
    });
  });

  it('двоеточие и дробные значения', () => {
    expect(parseTurnoversByYear('24: 82,2; 25: 50')).toEqual({ '2024': 82.2, '2025': 50 });
  });

  it('единицы измерения приводятся к миллионам', () => {
    expect(parseTurnoversByYear('2024 - 1,5 млрд')).toEqual({ '2024': 1500 });
    expect(parseTurnoversByYear('2024 - 500 тыс')).toEqual({ '2024': 0.5 });
  });

  it('диапазон лет не принимается за оборот', () => {
    expect(parseTurnoversByYear('2023-2024')).toEqual({});
  });

  it('нули и мусор пропускаются', () => {
    expect(parseTurnoversByYear('0')).toEqual({});
    expect(parseTurnoversByYear('Мин')).toEqual({});
    expect(parseTurnoversByYear('До 16г')).toEqual({});
  });

  it('год без суммы не распадается на «20» и «26»', () => {
    expect(parseTurnoversByYear('2026: минимальные')).toEqual({});
    expect(parseTurnoversByYear('2025: минимальные; 2026: минимальные')).toEqual({});
  });

  it('обороты вперемешку с текстом, как пишут продавцы', () => {
    expect(parseTurnoversByYear('счет в точке и альфе оборот в 23-80, 24-67; 25-10, 26-1 СРО до августа 26'))
      .toEqual({ '2023': 80, '2024': 67, '2025': 10, '2026': 1 });
    expect(parseTurnoversByYear('оборот за 23-41млн; 24-40млн; 25-57млн; 26-1,5млн'))
      .toEqual({ '2023': 41, '2024': 40, '2025': 57, '2026': 1.5 });
  });

  it('turnover_last_m — оборот последнего года', () => {
    const r = normalizeTurnover('23-4млн; 24-12млн');
    expect(r.value).toBe(12);
    expect(r.byYear).toEqual({ '2023': 4, '2024': 12 });
    expect(r.raw).toBe('23-4млн; 24-12млн');
  });

  it('пустое значение не ломает разбор', () => {
    const r = normalizeTurnover(null);
    expect(r.value).toBeNull();
    expect(r.byYear).toEqual({});
  });
});

describe('добавление по ИНН одним сообщением', () => {
  // как владелец реально пишет боту
  const message =
    'Инн 1658151314 тел 89872908954 закуп 500 цена 650\n' +
    'Счет альфа, есть СРО, оборот за 23-41млн; 24-40млн; 25-57млн; 26-1,5млн';

  it('ИНН, телефон и цены вынимаются из строки', () => {
    const p = parseShortInput(message);
    expect(p.inn).toBe('1658151314');
    expect(p.contact).toBe('89872908954');
    expect(p.buyPriceK).toBe(500);
    expect(p.priceK).toBe(650);
  });

  it('из остатка сообщения раскладываются обороты и банк', () => {
    const rest = parseShortInput(message).extra ?? '';
    expect(parseTurnoversByYear(rest)).toEqual({
      '2023': 41, '2024': 40, '2025': 57, '2026': 1.5,
    });
    expect(findBanks(rest)).toBe('Альфа');
  });

  it('разобранные обороты не остаются в «дополнительно»', () => {
    const rest = parseShortInput(message).extra ?? '';
    const { byYear, rest: extra } = extractTurnovers(rest);

    expect(byYear).toEqual({ '2023': 41, '2024': 40, '2025': 57, '2026': 1.5 });
    // цифры оборотов вырезаны, содержательный остаток сохранён
    expect(extra).not.toMatch(/41млн|40млн|57млн|1,5млн/);
    expect(extra).toContain('СРО');
    expect(extra).toContain('альфа');
  });
});

describe('вырезание оборотов из текста', () => {
  it('остаётся только то, что не про обороты', () => {
    const { byYear, rest } = extractTurnovers('Счет альфа, есть СРО, оборот за 23-41млн; 24-40млн');
    expect(byYear).toEqual({ '2023': 41, '2024': 40 });
    expect(rest).toBe('Счет альфа, есть СРО');
  });

  it('если кроме оборотов ничего не было — остаётся пусто', () => {
    const { rest } = extractTurnovers('оборот за 23-41млн; 24-40млн');
    expect(rest).toBeNull();
  });

  it('текст без оборотов не трогается', () => {
    const { byYear, rest } = extractTurnovers('Счет альфа, есть СРО');
    expect(byYear).toEqual({});
    expect(rest).toBe('Счет альфа, есть СРО');
  });

  it('после выреза не остаётся висячих пробелов и запятых', () => {
    const { rest } = extractTurnovers(
      'счет в точке и альфе оборот в 23-80, 24-67; 25-10, 26-1 СРО до августа 26',
    );
    expect(rest).toBe('счет в точке и альфе, СРО до августа 26');
  });
});

describe('банки распознаются в свободном тексте', () => {
  it('популярные банки ниши', () => {
    expect(findBanks('р/с в Сбере и Альфе')).toBe('Сбер, Альфа');
    expect(findBanks('счёт в Точке')).toBe('Точка');
    expect(findBanks('Т-Банк, Модульбанк')).toBe('Тинькофф, Модульбанк');
    expect(findBanks('открыт в Ак Барс банке')).toBe('Ак Барс');
  });

  it('латиница и сокращения', () => {
    expect(findBanks('Sber, VTB')).toBe('Сбер, ВТБ');
    expect(findBanks('ПСБ')).toBe('ПСБ');
  });

  it('без банков — null', () => {
    expect(findBanks('долгов нет, офис в аренде')).toBeNull();
    expect(findBanks(null)).toBeNull();
  });

  it('отдельная колонка банков приоритетнее «дополнительно»', () => {
    const r = normalizeExtra('есть счёт в Сбере', [], 'Альфа');
    expect(r.banks).toBe('Альфа');
  });

  it('если колонки нет — берём из «дополнительно»', () => {
    const r = normalizeExtra('р/с открыт в Точке, лицензия есть', []);
    expect(r.banks).toBe('Точка');
    expect(r.has_license).toBe(true);
  });
});
