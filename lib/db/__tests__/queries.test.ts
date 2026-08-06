import { describe, it, expect } from 'vitest';
import { filtersFromSearchParams } from '../queries';

describe('filtersFromSearchParams', () => {
  it('разбирает фильтр по оборотам, включая запятую', () => {
    const f = filtersFromSearchParams({ turnover_min: '1,5', turnover_max: '20' });
    expect(f.turnover_min).toBe(1.5);
    expect(f.turnover_max).toBe(20);
  });

  it('пустые и нечисловые значения игнорируются', () => {
    const f = filtersFromSearchParams({ turnover_min: '', turnover_max: 'много' });
    expect(f.turnover_min).toBeUndefined();
    expect(f.turnover_max).toBeUndefined();
  });

  it('разбирает фильтр по цене', () => {
    const f = filtersFromSearchParams({ price_min: '50', price_max: '200' });
    expect(f.price_min).toBe(50);
    expect(f.price_max).toBe(200);
  });

  it('поиск и флаги разбираются как раньше', () => {
    const f = filtersFromSearchParams({ q: '223', needs_review: 'true', region: 'rt' });
    expect(f.q).toBe('223');
    expect(f.needs_review).toBe(true);
    expect(f.region).toBe('rt');
  });
});
