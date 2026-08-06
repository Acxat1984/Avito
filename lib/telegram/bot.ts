import { sql } from '@/lib/db/client';
import { config } from '@/lib/config';
import { TgUpdate, sendText, answerCallback } from './api';
import { touchUser, setRole, listUsers, TgRole } from './users';
import { formatCompanyCard, CompanyLike, lastFullYearTurnover, ru } from '@/lib/format/company-card';
import { parseCompaniesFromText } from '@/lib/llm/parse-company';
import { parseShortInput } from './parse-short';
import { createCompanyFromInn } from '@/lib/companies/create-from-inn';
import { STATUS_RU } from '@/lib/dadata/client';
import { normalizeCompany } from '@/lib/normalize';
import { regionName, regionFromText } from '@/lib/normalize/regions';

const MAX_RESULTS = 10;

const KEYBOARD_GUEST = [['📋 Все компании', '🗺 Регионы']];
const KEYBOARD_ADMIN = [
  ['📋 Все компании', '🗺 Регионы'],
  ['➕ Добавить', '👥 Пользователи'],
];

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? '';
  return base ? `${base}${path}` : path;
}

const TAX_RU: Record<string, string> = {
  osno: 'ОСНО',
  usn6: 'УСН 6%',
  usn_dr: 'УСН доходы-расходы',
  ausn: 'АУСН',
};

/** Обезличенная строка для тех, у кого нет доступа к полным данным. */
function anonLine(c: Record<string, unknown>): string {
  const parts = [regionName(c.region_code as string) ?? 'регион уточняется'];
  if (c.year_reg) parts.push(`${c.year_reg} год`);
  if (c.tax_system) parts.push(TAX_RU[String(c.tax_system)] ?? String(c.tax_system));
  const turn = lastFullYearTurnover(c.turnovers as Record<string, number> | null);
  if (turn) parts.push(`оборот ${turn.year} — ${ru(turn.value)} млн`);
  if (c.has_license) parts.push('лицензия');
  return `№ ${c.id} — ${parts.join(', ')}, цена обсуждается`;
}

/** Страница компаний: берём на одну больше, чтобы понять, есть ли продолжение. */
async function findCompanies(regionCode: string | null, offset: number) {
  const rows = regionCode
    ? await sql`
        select * from companies
        where status = 'verified' and region_code = ${regionCode}
        order by id limit ${MAX_RESULTS + 1} offset ${offset}`
    : await sql`
        select * from companies
        where status = 'verified'
        order by id limit ${MAX_RESULTS + 1} offset ${offset}`;
  return { rows: rows.slice(0, MAX_RESULTS), hasMore: rows.length > MAX_RESULTS };
}

/** Выдача списка компаний с учётом роли; offset — постраничный показ по кнопке «Показать ещё». */
async function sendCompanyList(
  chatId: number,
  role: TgRole,
  regionCode: string | null = null,
  offset = 0,
) {
  const full = role === 'admin' || role === 'partner' || config.telegram.guestAccess === 'full';

  if (!full && config.telegram.guestAccess === 'closed') {
    await sendText(
      chatId,
      'Доступ к базе выдаётся вручную. Напишите, пожалуйста, кто вы и по какому вопросу — мы откроем доступ.',
    );
    await notifyAdmins(`🔔 Запрос доступа к базе от chat_id ${chatId}`);
    return;
  }

  const { rows, hasMore } = await findCompanies(regionCode, offset);
  if (rows.length === 0) {
    await sendText(
      chatId,
      offset > 0 ? 'Это все варианты по запросу.' : 'По этому запросу сейчас нет вариантов в продаже.',
    );
    return;
  }

  // callback_data ограничена 64 байтами, поэтому только offset и код региона
  const moreButton = [
    [{ text: '➡️ Показать ещё', callback_data: `more:${offset + MAX_RESULTS}:${regionCode ?? ''}` }],
  ];

  const where = regionCode ? ` (${regionName(regionCode)})` : '';
  const range = `${offset + 1}–${offset + rows.length}`;
  if (full) {
    await sendText(chatId, `Компании в продаже${where}, ${range}:`);
    for (let i = 0; i < rows.length; i++) {
      const isLast = i === rows.length - 1;
      await sendText(
        chatId,
        formatCompanyCard(rows[i] as unknown as CompanyLike),
        isLast && hasMore ? { inline: moreButton } : {},
      );
    }
  } else {
    const lines = rows.map((c) => anonLine(c));
    await sendText(
      chatId,
      `Варианты в продаже${where} (${range}):\n\n${lines.join('\n')}\n\n` +
        'Напишите номер интересующего варианта — специалист свяжется с вами и расскажет детали.',
      hasMore ? { inline: moreButton } : {},
    );
  }
}

/**
 * Сводка по базе: сколько компаний в продаже и в каких регионах.
 * Админ дополнительно видит черновики и общий размер базы.
 */
async function sendRegions(chatId: number, role: TgRole): Promise<void> {
  const isAdmin = role === 'admin';

  const rows = await sql`
    select region_code,
           count(*) filter (where status = 'verified')::int as verified,
           count(*) filter (where status = 'draft')::int as draft
    from companies
    where status in ('verified', 'draft')
    group by region_code
    having count(*) filter (where status = 'verified') > 0 or ${isAdmin}
    order by count(*) filter (where status = 'verified') desc, region_code
  `;

  const [totals] = await sql`
    select
      count(*) filter (where status = 'verified')::int as verified,
      count(*) filter (where status = 'draft')::int as draft,
      count(*) filter (where status = 'archived')::int as archived,
      count(*)::int as total
    from companies
  `;

  const lines = rows
    .filter((r) => isAdmin || Number(r.verified) > 0)
    .map((r) => {
      const name = regionName(r.region_code as string) ?? 'регион не указан';
      const v = Number(r.verified);
      const d = Number(r.draft);
      const extra = isAdmin && d > 0 ? ` (+${d} черн.)` : '';
      return `• ${name} — ${v}${extra}`;
    });

  if (lines.length === 0) {
    await sendText(chatId, 'В продаже сейчас нет компаний.');
    return;
  }

  const header = `🗺 Компании в продаже: ${Number(totals.verified)}\n`;
  const footer = isAdmin
    ? `\n\nВсего в базе: ${Number(totals.total)} ` +
      `(в продаже ${Number(totals.verified)}, черновиков ${Number(totals.draft)}, архив ${Number(totals.archived)})` +
      '\n\nНапишите название региона — покажу карточки.'
    : '\n\nНапишите название региона — покажу варианты.';

  await sendText(chatId, `${header}\n${lines.join('\n')}${footer}`);
}

async function notifyAdmins(text: string): Promise<void> {
  const admins = await sql`select chat_id from tg_users where role = 'admin'`;
  const ids = new Set<number>([
    ...config.telegram.adminIds,
    ...admins.map((a) => Number(a.chat_id)),
  ]);
  for (const id of ids) await sendText(id, text);
}

/** Добавление компании админом: свободный текст → карточка. */
async function addCompanyFromText(chatId: number, text: string): Promise<void> {
  await sendText(chatId, '⏳ Разбираю данные…');
  const parsed = await parseCompaniesFromText(text);
  if (!parsed.ok || parsed.companies.length === 0) {
    await sendText(
      chatId,
      '❌ Не удалось распознать данные компании. Пришлите текст с названием, ИНН, регионом, годом, налоговым режимом, оборотами и ценой.',
    );
    return;
  }

  for (const item of parsed.companies) {
    const n = item.normalized;
    const name = n.name ?? n.inn_raw ?? 'Без названия';

    // дубль по ИНН
    if (n.inn) {
      const [dup] = await sql`select id, name, status from companies where inn = ${n.inn}`;
      if (dup) {
        await sendText(
          chatId,
          `⚠️ Компания с ИНН ${n.inn} уже есть в базе: «${dup.name}» (№ ${dup.id}, статус ${dup.status}).\n` +
            `Откройте карточку: ${appUrl(`/admin/companies/${dup.id}`)}`,
        );
        continue;
      }
    }

    const raw = item.raw as Record<string, string | null>;
    const turnovers: Record<string, number> = {};
    // обороты из текста вида «2023 - 92 млн»
    for (const m of text.matchAll(/(20\d{2})\s*(?:год)?\s*[-–—:]\s*([\d.,]+)\s*млн/gi)) {
      const v = Number(m[2].replace(',', '.'));
      if (Number.isFinite(v)) turnovers[m[1]] = v;
    }
    const years = Object.keys(turnovers).sort();
    const lastTurnover = years.length ? turnovers[years[years.length - 1]] : n.turnover_last_m;

    const [row] = await sql`
      insert into companies (
        name, inn, inn_raw, seller_contact, region_code, city_raw,
        year_reg, year_raw, turnover_note, turnover_last_m, turnovers,
        price_k, price_raw, tax_system, tax_raw, extra, has_license, banks,
        address, okved, status, source, needs_review, review_notes
      ) values (
        ${name}, ${n.inn}, ${n.inn_raw}, ${n.seller_contact}, ${n.region_code}, ${n.city_raw},
        ${n.year_reg}, ${n.year_raw}, ${n.turnover_note}, ${lastTurnover}, ${JSON.stringify(turnovers)}::jsonb,
        ${n.price_k}, ${n.price_raw}, ${n.tax_system}, ${n.tax_raw}, ${n.extra}, ${n.has_license}, ${n.banks},
        ${raw.address ?? null}, ${raw.okved ?? null},
        'draft', 'telegram', true, ${'добавлено через Telegram; ' + n.problems.join('; ')}
      ) returning id
    `;
    await sql`
      insert into company_audit (company_id, actor, changes)
      values (${row.id}, ${'tg:' + chatId}, ${JSON.stringify({ created: { old: null, new: name } })}::jsonb)
    `;

    const created = await sql`select * from companies where id = ${row.id}`;
    await sendText(
      chatId,
      `✅ Компания добавлена как черновик (№ ${row.id}):\n\n` +
        formatCompanyCard(created[0] as unknown as CompanyLike) +
        `\n\n⚠️ Клиентам не показывается, пока не переведёте в «verified»:\n${appUrl(`/admin/companies/${row.id}`)}`,
    );
  }
}

/** Быстрое добавление по ИНН: остальное подтягивается из ЕГРЮЛ. */
async function quickAdd(chatId: number, text: string): Promise<void> {
  const parsed = parseShortInput(text);
  if (!parsed.inn) {
    await sendText(chatId, HELP_QUICK, { html: true });
    return;
  }

  await sendText(chatId, '⏳ Запрашиваю данные из ЕГРЮЛ…');
  const result = await createCompanyFromInn({
    inn: parsed.inn,
    contact: parsed.contact,
    buyPriceK: parsed.buyPriceK,
    priceK: parsed.priceK,
    extra: parsed.extra,
    actor: `tg:${chatId}`,
  });

  if (!result.ok) {
    await sendText(
      chatId,
      `❌ ${result.error}` +
        (result.duplicateId ? `\n\n${appUrl(`/admin/companies/${result.duplicateId}`)}` : ''),
    );
    return;
  }

  const [created] = await sql`select * from companies where id = ${result.id}`;
  const statusNote =
    result.egrulStatus && result.egrulStatus !== 'ACTIVE'
      ? `\n\n⚠️ Внимание, статус в ЕГРЮЛ: ${STATUS_RU[result.egrulStatus] ?? result.egrulStatus}`
      : '';

  await sendText(
    chatId,
    `✅ Добавлено (черновик № ${result.id}):\n\n` +
      formatCompanyCard(created as unknown as CompanyLike, { showBuyPrice: true }) +
      statusNote +
      `\n\n📝 Осталось дозаполнить: ${result.warnings.join('; ')}\n${appUrl(`/admin/companies/${result.id}`)}`,
    {
      inline: [[{ text: '✅ Сразу в продажу', callback_data: `verify:${result.id}` }]],
    },
  );
}

/** Показ одной карточки по номеру. */
async function sendCompanyById(chatId: number, id: number, role: TgRole): Promise<void> {
  const [c] = await sql`select * from companies where id = ${id}`;
  if (!c) {
    await sendText(chatId, `Карточка № ${id} не найдена.`);
    return;
  }
  const full = role === 'admin' || role === 'partner' || config.telegram.guestAccess === 'full';
  if (!full) {
    if (c.status !== 'verified') {
      await sendText(chatId, `Вариант № ${id} сейчас недоступен.`);
      return;
    }
    await sendText(
      chatId,
      `${anonLine(c)}\n\nСпециалист свяжется с вами по этому варианту.`,
    );
    await notifyAdmins(`🔔 Интерес к варианту № ${id} от chat_id ${chatId}`);
    return;
  }
  if (c.status !== 'verified' && role !== 'admin') {
    await sendText(chatId, `Вариант № ${id} сейчас недоступен.`);
    return;
  }
  await sendText(chatId, formatCompanyCard(c as unknown as CompanyLike, { showBuyPrice: role === 'admin' }));
}

const HELP_GUEST =
  'Здравствуйте! Здесь можно посмотреть готовые фирмы в продаже.\n\n' +
  '📋 «Все компании» — список вариантов\n' +
  '🗺 «Регионы» — где и сколько фирм есть\n' +
  '🔍 Напишите название региона (например «Казань») — покажу варианты там\n' +
  'Или пришлите номер варианта, чтобы узнать детали.';

const HELP_QUICK =
  '⚡ Быстрое добавление по ИНН.\n\n' +
  'Пришлите ИНН — название, год, регион, адрес и ОКВЭД подтяну из ЕГРЮЛ.\n' +
  'Можно сразу добавить телефон и цены:\n\n' +
  '<code>7328108216 тел 89278250111 закуп 20 цена 100 альфа, офис</code>\n\n' +
  'Или построчно:\n' +
  '<code>ИНН 7328108216\nтел 89278250111\nзакуп 20\nцена 100\nАльфа, есть долг 64тр</code>';

const HELP_PASTE =
  '💬 Добавление из переписки.\n\n' +
  'Пришлите команду /add и следом скопированный текст диалога с Avito — ' +
  'нейросеть распознает название, ИНН, регион, год, налоговый режим, обороты по годам и цену.\n\n' +
  'Телефоны и ИНН маскируются перед отправкой в нейросеть.';

const HELP_ADMIN =
  'Режим администратора.\n\n' +
  '📋 «Все компании» — список\n' +
  '🗺 «Регионы» — сводка по базе: регионы, в продаже, черновики\n' +
  '➕ «Добавить» — два способа:\n' +
  '   ⚡ пришлите ИНН → данные из ЕГРЮЛ\n' +
  '   💬 /add + переписка → разбор нейросетью\n' +
  '👥 «Пользователи» — список и выдача доступа\n' +
  '🔍 Регион («Казань») или номер карточки — быстрый поиск\n\n' +
  'Команды: /inn <ИНН…>, /add <текст>, /regions, /users, /grant <chat_id>, /revoke <chat_id>';

/** Роутер входящих сообщений. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    const cq = update.callback_query;
    await answerCallback(cq.id);
    const chatId = cq.message?.chat.id;
    const data = cq.data ?? '';
    if (!chatId) return;
    const user = await touchUser(cq.from, chatId);
    // следующая страница списка компаний: more:<offset>:<region|пусто>
    if (data.startsWith('more:')) {
      const [, off, reg] = data.split(':');
      await sendCompanyList(chatId, user.role, reg || null, Math.max(0, Number(off) || 0));
      return;
    }
    if (data.startsWith('grant:') && user.role === 'admin') {
      const target = Number(data.slice(6));
      await setRole(target, 'partner');
      await sendText(chatId, `✅ Доступ выдан: ${target}`);
      await sendText(target, '✅ Вам открыт доступ к базе. Нажмите «Все компании».', {
        keyboard: KEYBOARD_GUEST,
      });
      return;
    }
    if (data.startsWith('verify:') && user.role === 'admin') {
      const id = Number(data.slice(7));
      const [c] = await sql`select id, name, status from companies where id = ${id}`;
      if (!c) {
        await sendText(chatId, `Карточка № ${id} не найдена.`);
        return;
      }
      if (c.status === 'verified') {
        await sendText(chatId, `№ ${id} «${c.name}» уже в продаже.`);
        return;
      }
      await sql`update companies set status = 'verified', updated_at = now() where id = ${id}`;
      await sql`
        insert into company_audit (company_id, actor, changes)
        values (${id}, ${'tg:' + chatId}, ${JSON.stringify({ status: { old: c.status, new: 'verified' } })}::jsonb)
      `;
      await sendText(chatId, `✅ № ${id} «${c.name}» переведена в продажу.`);
      return;
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text || !msg.from) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  const user = await touchUser(msg.from, chatId);
  if (user.role === 'blocked') return;
  const isAdmin = user.role === 'admin';
  const keyboard = isAdmin ? KEYBOARD_ADMIN : KEYBOARD_GUEST;

  // /start и помощь
  if (/^\/start|^\/help|^помощь$/i.test(text)) {
    await sendText(chatId, isAdmin ? HELP_ADMIN : HELP_GUEST, { keyboard });
    if (!isAdmin) {
      await notifyAdmins(
        `👤 Новый пользователь бота: ${user.full_name ?? ''} ${user.username ? '@' + user.username : ''} (chat_id ${chatId})`,
      );
    }
    return;
  }

  // ===== админские команды =====
  if (isAdmin) {
    if (/^\/users|^👥/.test(text)) {
      const users = await listUsers();
      const lines = users.map(
        (u) =>
          `${u.role === 'admin' ? '👑' : u.role === 'partner' ? '✅' : u.role === 'blocked' ? '🚫' : '👤'} ` +
          `${u.full_name ?? '—'} ${u.username ? '@' + u.username : ''} — ${u.role}, ${u.requests} обр. (${u.chat_id})`,
      );
      await sendText(
        chatId,
        `Пользователи бота:\n\n${lines.join('\n')}\n\nВыдать доступ: /grant <chat_id>\nЗабрать: /revoke <chat_id>`,
      );
      return;
    }
    const grant = text.match(/^\/grant\s+(-?\d+)/);
    if (grant) {
      const target = Number(grant[1]);
      await setRole(target, 'partner');
      await sendText(chatId, `✅ Доступ выдан пользователю ${target}`);
      await sendText(target, '✅ Вам открыт доступ к базе. Нажмите «Все компании».', {
        keyboard: KEYBOARD_GUEST,
      });
      return;
    }
    const revoke = text.match(/^\/revoke\s+(-?\d+)/);
    if (revoke) {
      await setRole(Number(revoke[1]), 'guest');
      await sendText(chatId, `Доступ снят: ${revoke[1]}`);
      return;
    }
    // краткий формат: ИНН + цены, остальное из ЕГРЮЛ
    if (/^\/inn\b/i.test(text)) {
      const payload = text.replace(/^\/inn\s*/i, '');
      if (!payload) {
        await sendText(chatId, HELP_QUICK, { html: true });
        return;
      }
      await quickAdd(chatId, payload);
      return;
    }
    // разбор переписки нейросетью
    if (/^\/add\b/i.test(text)) {
      const payload = text.replace(/^\/add\s*/i, '');
      if (!payload) {
        await sendText(chatId, HELP_PASTE);
        return;
      }
      await addCompanyFromText(chatId, payload);
      return;
    }
    if (/^➕/.test(text)) {
      await sendText(
        chatId,
        'Как добавить компанию:\n\n' +
          '⚡ <b>Быстро по ИНН</b> — пришлите ИНН (можно с телефоном и ценами), остальное подтяну из ЕГРЮЛ:\n' +
          '   <code>7328108216 тел 89278250111 закуп 20 цена 100 альфа</code>\n\n' +
          '💬 <b>Из переписки</b> — команда /add и следом скопированный диалог с Avito, разберу нейросетью.\n\n' +
          'Просто пришлите ИНН — я пойму.',
        { html: true },
      );
      return;
    }
  }

  // ===== общие действия =====
  if (/^📋|^все компании$/i.test(text)) {
    await sendCompanyList(chatId, user.role);
    return;
  }
  if (/^🗺|^регионы$|^\/regions/i.test(text)) {
    await sendRegions(chatId, user.role);
    return;
  }
  if (/^🔍/.test(text)) {
    await sendText(chatId, 'Напишите название города или региона — например «Казань» или «Самара».');
    return;
  }

  // ИНН (10 или 12 цифр) от админа → быстрое добавление;
  // номера карточек короче, поэтому не конфликтуют
  if (isAdmin && /(?:^|\s)(\d{10}|\d{12})(?:\s|$)/.test(text)) {
    await quickAdd(chatId, text);
    return;
  }

  // номер карточки
  const idMatch = text.match(/^[№#]?\s*(\d{1,9})$/);
  if (idMatch) {
    await sendCompanyById(chatId, Number(idMatch[1]), user.role);
    return;
  }

  // регион
  const region = regionFromText(text);
  if (region) {
    await sendCompanyList(chatId, user.role, region);
    return;
  }

  // админу длинный текст без ИНН = переписка → разбор нейросетью
  if (isAdmin && text.length > 60) {
    await addCompanyFromText(chatId, text);
    return;
  }

  await sendText(
    chatId,
    'Не понял запрос. Нажмите «Все компании», напишите название региона или номер варианта.',
    { keyboard },
  );
  if (!isAdmin) {
    await notifyAdmins(`💬 Сообщение боту от chat_id ${chatId}: «${text.slice(0, 200)}»`);
  }
}
