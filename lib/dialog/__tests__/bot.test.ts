import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('AVITO_USER_ID', '111');
vi.stubEnv('AVITO_ITEM_IDS', '2365468894');

const { guardMessage } = await import('@/lib/avito/guards');
const { TEMPLATES, violatesInv2, formatOffers, clampReply } = await import('@/lib/dialog/state');

function payload(over: Record<string, unknown> = {}) {
  return {
    payload: {
      type: 'message',
      value: {
        id: 'm1',
        chat_id: 'c1',
        user_id: 111,
        author_id: 222,
        created: 1,
        type: 'text',
        chat_type: 'u2i',
        item_id: 2365468894,
        content: { text: 'привет' },
        ...over,
      },
    },
  };
}

describe('guards (раздел 9 / тесты приёмки)', () => {
  it('петля: author_id == user_id → игнор (0 исходящих)', () => {
    const r = guardMessage(payload({ author_id: 111 }));
    expect(r.kind).toBe('ignore');
  });
  it('system + flow_id → игнор', () => {
    const r = guardMessage(payload({ type: 'system', content: { flow_id: 'f1' } }));
    expect(r.kind).toBe('ignore');
  });
  it('link/image/location от клиента → эскалация', () => {
    for (const t of ['link', 'image', 'location']) {
      expect(guardMessage(payload({ type: t })).kind).toBe('escalate');
    }
  });
  it('voice → эскалация', () => {
    expect(guardMessage(payload({ type: 'voice' })).kind).toBe('escalate');
  });
  it('chat_type != u2i → игнор', () => {
    expect(guardMessage(payload({ chat_type: 'u2u' })).kind).toBe('ignore');
  });
  it('невалидный payload → игнор', () => {
    expect(guardMessage({} as never).kind).toBe('ignore');
    expect(guardMessage({ payload: { type: 'chat' } } as never).kind).toBe('ignore');
  });
  it('нормальный текст клиента → process', () => {
    expect(guardMessage(payload()).kind).toBe('process');
  });
  it('чужое объявление (не из AVITO_ITEM_IDS) → игнор, даже voice', () => {
    expect(guardMessage(payload({ item_id: 4573421990 })).kind).toBe('ignore');
    expect(guardMessage(payload({ item_id: 4573421990, type: 'voice' })).kind).toBe('ignore');
    expect(guardMessage(payload({ item_id: undefined })).kind).toBe('ignore');
  });
});

describe('INV-2: нет URL/телефонов/цен в исходящих', () => {
  it('все шаблоны проходят проверку', () => {
    for (const [name, text] of Object.entries(TEMPLATES)) {
      expect(violatesInv2(text), `шаблон ${name}`).toBeNull();
    }
  });
  it('ссылки блокируются', () => {
    expect(violatesInv2('смотрите https://example.com')).toBe('link');
    expect(violatesInv2('наш сайт example.ru')).toBe('link');
    expect(violatesInv2('пишите в t.me/somebot')).toBe('link');
  });
  it('телефоны блокируются', () => {
    expect(violatesInv2('звоните +7 917 123-45-67')).toBe('phone');
    expect(violatesInv2('номер 89171234567')).not.toBeNull();
  });
  it('конкретные цены блокируются', () => {
    expect(violatesInv2('цена 150 000 ₽')).toBe('price');
    expect(violatesInv2('отдадим за 100 тыс руб')).toBe('price');
  });
  it('года и обороты в подборе — не нарушение', () => {
    expect(
      violatesInv2('— Татарстан, регистрация 2019 г., УСН 6%, обороты ~12 млн/год, цена обсуждается'),
    ).toBeNull();
  });
});

describe('INV-4: подбор — только обезличенные поля (белый список)', () => {
  it('в тексте нет ИНН, названия, контактов, цены числом', () => {
    const text = formatOffers([
      { region_code: 'rt', year_reg: 2019, tax_system: 'usn6', turnover_last_m: 12 },
      { region_code: 'msk', year_reg: 2006, tax_system: 'osno', turnover_last_m: null },
    ]);
    expect(text).toContain('Татарстан');
    expect(text).toContain('2019');
    expect(text).toContain('цена обсуждается');
    // ничего похожего на ИНН/телефон и ссылок
    expect(violatesInv2(text)).toBeNull();
    expect(text).not.toMatch(/ооо|инн/i);
  });
});

describe('ограничение длины ответа ≤ 1000', () => {
  it('clampReply обрезает', () => {
    expect(clampReply('a'.repeat(2000)).length).toBeLessThanOrEqual(1000);
    expect(clampReply('короткий')).toBe('короткий');
  });
  it('шаблоны вопросов укладываются в лимит', () => {
    expect(TEMPLATES.askSeller.length).toBeLessThanOrEqual(1000);
    expect(TEMPLATES.askBuyer.length).toBeLessThanOrEqual(1000);
  });
});
