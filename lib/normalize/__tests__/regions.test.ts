import { describe, it, expect } from 'vitest';
import { regionFromText, REGION_NAMES } from '../regions';

describe('regionFromText — поиск региона по свободному тексту', () => {
  it('каждое название из списка «Регионы» распознаётся', () => {
    // бот показывает пользователю названия из REGION_NAMES и просит написать одно из них
    for (const [code, name] of Object.entries(REGION_NAMES)) {
      expect(regionFromText(name), `«${name}»`).toBe(code);
    }
  });

  it('регистр и лишние пробелы не мешают', () => {
    expect(regionFromText('татарстан')).toBe('rt');
    expect(regionFromText('ТАТАРСТАН')).toBe('rt');
    expect(regionFromText('  Санкт-Петербург  ')).toBe('spb');
  });

  it('сокращения и города', () => {
    expect(regionFromText('рт')).toBe('rt');
    expect(regionFromText('Казань')).toBe('kzn');
    expect(regionFromText('челны')).toBe('rt');
    expect(regionFromText('спб')).toBe('spb');
    expect(regionFromText('Питер')).toBe('spb');
    expect(regionFromText('уфа')).toBe('rb');
    expect(regionFromText('екб')).toBe('ekb');
    expect(regionFromText('Екатеринбург')).toBe('ekb');
  });

  it('регион внутри фразы', () => {
    expect(regionFromText('есть что-то в Татарстане?')).toBe('rt');
    expect(regionFromText('покажи по региону рт')).toBe('rt');
    expect(regionFromText('компании в казани')).toBe('kzn');
  });

  it('короткие синонимы не срабатывают внутри чужих слов', () => {
    // «но» → nn, «рт» → rt ловились как подстроки
    expect(regionFromText('Новосибирск')).toBe('nsk');
    expect(regionFromText('норм')).toBeNull();
    expect(regionFromText('спорт')).toBeNull();
  });

  it('непонятный текст → null', () => {
    expect(regionFromText('а сколько стоит?')).toBeNull();
    expect(regionFromText('привет')).toBeNull();
  });
});
