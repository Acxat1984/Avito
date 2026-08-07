import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Тесты роутера Telegram-бота с фиктивной БД: проверяют ветвления
 * handleUpdate, пагинацию списка и разграничение доступа по ролям.
 * Реальная сеть и Neon не задействованы.
 */

vi.stubEnv('TELEGRAM_ADMIN_IDS', '100');
vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');

interface FakeCompany {
  id: number;
  name: string;
  status: string;
  region_code: string | null;
  inn?: string | null;
  seller_contact?: string | null;
  year_reg?: number | null;
  tax_system?: string | null;
}

/** Состояние фиктивной БД, перезаписывается в каждом тесте. */
const db: { companies: FakeCompany[]; role: string } = { companies: [], role: 'guest' };

function makeCompanies(n: number, status = 'verified'): FakeCompany[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `ООО Тест ${i + 1}`,
    status,
    region_code: 'rt',
    inn: `770708389${i}`,
    seller_contact: '+7 900 000-00-00',
    year_reg: 2019,
    tax_system: 'usn6',
  }));
}

/** Минимальная эмуляция neon: разбираем запрос по ключевым словам. */
vi.mock('@/lib/db/client', () => {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.includes('insert into tg_users')) {
      return [{ chat_id: values[0], username: 'u', full_name: 'U', role: db.role, requests: 1 }];
    }
    if (q.includes('from tg_users')) return [];
    if (q.includes('count(*)::int as n from companies')) {
      const statuses = values[0] as string[];
      const region = values[1] as string | undefined;
      const n = db.companies.filter(
        (c) => statuses.includes(c.status) && (region === undefined || c.region_code === region),
      ).length;
      return [{ n }];
    }
    if (q.includes('select * from companies where status = any')) {
      const statuses = values[0] as string[];
      const hasRegion = q.includes('region_code = ?');
      const region = hasRegion ? (values[1] as string) : undefined;
      const limit = Number(values[hasRegion ? 2 : 1]);
      const offset = Number(values[hasRegion ? 3 : 2]);
      const rows = db.companies
        .filter((c) => statuses.includes(c.status) && (region === undefined || c.region_code === region))
        .sort((a, b) => a.id - b.id);
      return rows.slice(offset, offset + limit);
    }
    if (q.includes('select * from companies where id =')) {
      const id = Number(values[0]);
      return db.companies.filter((c) => c.id === id);
    }
    if (q.includes('from companies')) return [];
    return [];
  };
  return { sql };
});

/** Перехват исходящих сообщений вместо вызова Telegram API. */
const sent: Array<{ chatId: number; text: string; inline?: unknown }> = [];
vi.mock('@/lib/telegram/api', () => ({
  sendText: async (chatId: number, text: string, opts: Record<string, unknown> = {}) => {
    sent.push({ chatId, text, inline: opts.inline });
  },
  answerCallback: async () => {},
  setWebhook: async () => ({}),
}));

const { handleUpdate } = await import('../bot');

function msg(text: string, chatId = 100) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: 'private' },
      from: { id: chatId, username: 'tester', first_name: 'Т' },
      text,
      date: 0,
    },
  };
}

function callback(data: string, chatId = 100) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb',
      data,
      from: { id: chatId, username: 'tester', first_name: 'Т' },
      message: { message_id: 1, chat: { id: chatId, type: 'private' }, date: 0 },
    },
  };
}

/** Кнопка «Показать ещё» под любым из отправленных сообщений. */
function moreButton() {
  for (const s of sent) {
    const rows = s.inline as Array<Array<{ callback_data: string }>> | undefined;
    const btn = rows?.flat().find((b) => b.callback_data.startsWith('more:'));
    if (btn) return btn;
  }
  return undefined;
}

const allText = () => sent.map((s) => s.text).join('\n');

beforeEach(() => {
  sent.length = 0;
  db.companies = [];
  db.role = 'guest';
});

describe('пагинация списка компаний', () => {
  it('11 компаний → показаны 10 и есть кнопка «Показать ещё»', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(11);
    await handleUpdate(msg('📋 Все компании') as never);

    // 1 заголовок + 10 карточек
    expect(sent).toHaveLength(11);
    expect(sent[0].text).toContain('1–10 из 11');
    expect(moreButton()?.callback_data).toBe('more:10:');
  });

  it('ровно 10 компаний → кнопки нет', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(10);
    await handleUpdate(msg('📋 Все компании') as never);

    expect(sent[0].text).toContain('1–10 из 10');
    expect(moreButton()).toBeUndefined();
  });

  it('кнопка «Показать ещё» отдаёт вторую страницу', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(25);
    await handleUpdate(callback('more:10:') as never);

    expect(sent[0].text).toContain('11–20 из 25');
    // со второй страницы ведёт кнопка на третью
    expect(moreButton()?.callback_data).toBe('more:20:');
  });

  it('последняя страница не предлагает продолжение', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(12);
    await handleUpdate(callback('more:10:') as never);

    expect(sent[0].text).toContain('11–12 из 12');
    expect(moreButton()).toBeUndefined();
  });

  it('пагинация сохраняет выбранный регион', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(15);
    db.companies[0].region_code = 'msk';
    await handleUpdate(msg('Татарстан') as never);

    // 14 компаний в rt: показаны 10, есть продолжение с тем же регионом
    expect(sent[0].text).toContain('Татарстан');
    expect(sent[0].text).toContain('1–10 из 14');
    expect(moreButton()?.callback_data).toBe('more:10:rt');
  });

  it('offset за пределами выборки → сообщение о конце списка', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(5);
    await handleUpdate(callback('more:10:') as never);

    expect(allText()).toContain('Это все варианты');
  });
});

describe('роли и доступ к данным', () => {
  it('админ видит черновики с пометкой, гость — нет', async () => {
    db.role = 'admin';
    db.companies = [
      { id: 1, name: 'Продаётся', status: 'verified', region_code: 'rt' },
      { id: 2, name: 'Черновик', status: 'draft', region_code: 'rt' },
    ];
    await handleUpdate(msg('📋 Все компании') as never);
    expect(allText()).toContain('ЧЕРНОВИК');
    expect(allText()).toContain('из 2');

    sent.length = 0;
    db.role = 'guest';
    await handleUpdate(msg('📋 Все компании', 200) as never);
    expect(allText()).not.toContain('Черновик');
    expect(allText()).toContain('из 1');
  });

  it('INV-4: гость не получает названия, ИНН и контакты продавца', async () => {
    db.role = 'guest';
    db.companies = makeCompanies(3);
    await handleUpdate(msg('📋 Все компании', 200) as never);

    const text = allText();
    expect(text).not.toContain('ООО Тест');
    expect(text).not.toContain('7707083890');
    expect(text).not.toContain('+7 900');
    // но обезличенные поля есть
    expect(text).toContain('Татарстан');
    expect(text).toContain('2019');
  });

  it('гость не может добавлять компании по ИНН', async () => {
    db.role = 'guest';
    await handleUpdate(msg('7707083893 цена 100', 200) as never);
    expect(allText()).not.toContain('Запрашиваю данные из ЕГРЮЛ');
  });

  it('гость не может выдавать доступ через callback', async () => {
    db.role = 'guest';
    await handleUpdate(callback('grant:999', 200) as never);
    expect(allText()).not.toContain('Доступ выдан');
  });
});

describe('роутинг сообщений', () => {
  it('/start показывает разную справку админу и гостю', async () => {
    db.role = 'admin';
    await handleUpdate(msg('/start') as never);
    expect(allText()).toContain('Режим администратора');

    sent.length = 0;
    db.role = 'guest';
    await handleUpdate(msg('/start', 200) as never);
    expect(allText()).toContain('готовые фирмы в продаже');
  });

  it('номер карточки открывает конкретную компанию', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(3);
    await handleUpdate(msg('№ 2') as never);
    expect(allText()).toContain('ООО Тест 2');
  });

  it('несуществующий номер карточки — понятное сообщение', async () => {
    db.role = 'admin';
    await handleUpdate(msg('777') as never);
    expect(allText()).toContain('не найдена');
  });

  it('нераспознанный текст → подсказка, а не молчание', async () => {
    db.role = 'guest';
    await handleUpdate(msg('а сколько стоит?', 200) as never);
    expect(allText()).toContain('Не понял запрос');
  });

  it('название региона ищет по этому региону', async () => {
    db.role = 'admin';
    db.companies = makeCompanies(2);
    await handleUpdate(msg('Казань') as never);
    // в rt компании есть, в kzn — нет
    expect(allText()).toContain('нет вариантов');
  });
});
