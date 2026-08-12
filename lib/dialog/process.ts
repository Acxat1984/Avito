import { sql } from '@/lib/db/client';
import { guardMessage } from '@/lib/avito/guards';
import { WebhookPayload, WebhookMessage } from '@/lib/avito/types';
import { sendMessage, markRead } from '@/lib/avito/client';
import { analyzeDialog } from '@/lib/llm/openrouter';
import { normalizeCompany, normalizeRegion, normalizePrice } from '@/lib/normalize';
import { notify } from '@/lib/telegram/notify';
import { config } from '@/lib/config';
import { TEMPLATES, formatOffers, violatesInv2, clampReply, OfferCard } from './state';

interface DialogRow {
  id: number;
  avito_chat_id: string;
  status: string;
  intent: string | null;
  bot_messages_sent: number;
  extracted: Record<string, unknown> | null;
}

function adminUrl(path: string): string {
  const base = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return base ? `${base}${path}` : path;
}

async function logAction(dialogId: number, action: string, payload: unknown = null): Promise<void> {
  await sql`
    insert into bot_actions (dialog_id, action, payload)
    values (${dialogId}, ${action}, ${payload === null ? null : JSON.stringify(payload)}::jsonb)
  `;
}

async function setDialog(
  id: number,
  fields: { status?: string; intent?: string; extracted?: Record<string, unknown> },
): Promise<void> {
  await sql`
    update dialogs set
      status = coalesce(${fields.status ?? null}, status),
      intent = coalesce(${fields.intent ?? null}, intent),
      extracted = coalesce(${fields.extracted ? JSON.stringify(fields.extracted) : null}::jsonb, extracted),
      updated_at = now()
    where id = ${id}
  `;
}

/**
 * Единственная точка отправки сообщений клиенту.
 * INV-1: жёсткий счётчик ≤ 2. INV-2: проверка текста перед отправкой.
 */
async function sendBotMessage(dialog: DialogRow, text: string, action: string): Promise<boolean> {
  if (dialog.bot_messages_sent >= config.bot.maxMessages) {
    await logAction(dialog.id, 'send_blocked_inv1', { action });
    return false;
  }
  const violation = violatesInv2(text);
  if (violation) {
    await logAction(dialog.id, 'send_blocked_inv2', { action, violation });
    await notify(`🚫 INV-2: заблокирована отправка (${violation}) в диалоге #${dialog.id}`);
    return false;
  }
  await sendMessage(dialog.avito_chat_id, clampReply(text, config.bot.maxReplyLength));
  dialog.bot_messages_sent += 1;
  await sql`
    update dialogs set bot_messages_sent = bot_messages_sent + 1, updated_at = now()
    where id = ${dialog.id}
  `;
  await logAction(dialog.id, action, { text });
  return true;
}

async function createLead(
  dialogId: number,
  kind: 'buyer' | 'seller',
  hot: boolean,
  summary: string,
  companyId: number | null = null,
): Promise<number> {
  const [row] = await sql`
    insert into leads (dialog_id, kind, hot, summary, company_id)
    values (${dialogId}, ${kind}, ${hot}, ${summary}, ${companyId})
    returning id
  `;
  return Number(row.id);
}

/** Раздел 8.1: продавец с данными → карточка в companies (draft, needs_review). */
async function createSellerCard(
  dialog: DialogRow,
  extracted: Record<string, unknown>,
): Promise<number> {
  const s = (k: string) => (extracted[k] == null ? null : String(extracted[k]));
  const extraParts = [
    s('banks') && `банки: ${s('banks')}`,
    s('debts') && `долги/блокировки: ${s('debts')}`,
    s('license') && `лицензии: ${s('license')}`,
    s('address') && `адрес: ${s('address')}`,
    s('reason') && `причина продажи: ${s('reason')}`,
  ].filter(Boolean) as string[];

  // ТЕ ЖЕ функции нормализации, что и в импорте (lib/normalize)
  const norm = normalizeCompany({
    name: s('name') ?? s('form'),
    inn: s('inn'),
    city: s('city'),
    year: s('year'),
    tax: s('tax'),
    turnover: s('turnover'),
    price: s('price'),
    seller_contact: s('contact'),
    banks: s('banks'),
    extra: extraParts.join('; ') || null,
  });

  const name = norm.name ?? `Продавец из Avito (диалог #${dialog.id})`;
  const reviewNotes = ['карточка создана ботом', ...norm.problems].join('; ');

  const [row] = await sql`
    insert into companies (
      name, inn, inn_raw, seller_contact, region_code, city_raw,
      year_reg, year_raw, turnover_note, turnover_last_m, turnovers,
      price_k, price_raw, tax_system, tax_raw, extra, has_license, banks,
      status, source, needs_review, review_notes, dialog_id
    ) values (
      ${name}, ${norm.inn}, ${norm.inn_raw}, ${norm.seller_contact}, ${norm.region_code}, ${norm.city_raw},
      ${norm.year_reg}, ${norm.year_raw}, ${norm.turnover_note}, ${norm.turnover_last_m},
      ${JSON.stringify(norm.turnovers ?? {})}::jsonb,
      ${norm.price_k}, ${norm.price_raw}, ${norm.tax_system}, ${norm.tax_raw}, ${norm.extra}, ${norm.has_license}, ${norm.banks},
      'draft', 'avito_bot', true, ${reviewNotes}, ${dialog.id}
    )
    returning id
  `;
  const companyId = Number(row.id);
  await sql`
    insert into company_audit (company_id, actor, changes)
    values (${companyId}, 'bot', ${JSON.stringify({ created: { old: null, new: name } })}::jsonb)
  `;
  return companyId;
}

/** Раздел 8.2: подбор для покупателя — только verified, максимум 3, по свежести. */
async function findMatches(
  extracted: Record<string, unknown>,
): Promise<Array<OfferCard & { id: number }>> {
  const conds: string[] = [`status = 'verified'`];
  const params: unknown[] = [];

  const region = normalizeRegion(extracted.city ?? null).value;
  if (region) {
    params.push(region);
    conds.push(`region_code = $${params.length}`);
  }
  const budget = normalizePrice(extracted.price ?? null).value;
  if (budget) {
    params.push(budget);
    conds.push(`(price_k is null or price_k <= $${params.length})`);
  }
  if (extracted.license && !/нет|не нужн/i.test(String(extracted.license))) {
    conds.push('has_license = true');
  }

  const rows = await sql.query(
    `select id, region_code, year_reg, tax_system, turnover_last_m
     from companies where ${conds.join(' and ')}
     order by updated_at desc limit 3`,
    params,
  );
  return rows as unknown as Array<OfferCard & { id: number }>;
}

async function escalate(
  dialog: DialogRow,
  reason: string,
  opts: {
    kind?: 'buyer' | 'seller';
    hot?: boolean;
    summary?: string;
    companyId?: number | null;
    clientText?: string;
    sendText?: string | null;
  } = {},
): Promise<void> {
  if (opts.sendText) {
    await sendBotMessage(dialog, opts.sendText, 'escalation_message');
  }
  await setDialog(dialog.id, { status: 'escalated' });
  await logAction(dialog.id, 'escalated', { reason });

  const leadId = await createLead(
    dialog.id,
    opts.kind ?? (dialog.intent === 'sell' ? 'seller' : 'buyer'),
    opts.hot ?? false,
    opts.summary ?? `Эскалация: ${reason}`,
    opts.companyId ?? null,
  );

  await notify(
    `🔔 Эскалация (${reason})\nДиалог #${dialog.id}, лид #${leadId}${opts.companyId ? `, карточка #${opts.companyId}` : ''}\n` +
      (opts.clientText ? `Клиент: «${opts.clientText.slice(0, 300)}»\n` : '') +
      adminUrl(`/admin/dialogs?id=${dialog.id}`),
  );
}

/** Финальное решение при достаточных данных (сообщение-закрытие). */
async function finalize(
  dialog: DialogRow,
  intent: 'sell' | 'buy',
  extracted: Record<string, unknown>,
  clientText: string,
): Promise<void> {
  if (intent === 'sell') {
    const companyId = await createSellerCard(dialog, extracted);
    await escalate(dialog, 'seller_data_complete', {
      kind: 'seller',
      hot: true,
      summary: `Продавец: данные собраны. Карточка #${companyId}`,
      companyId,
      clientText,
      sendText: TEMPLATES.escalated,
    });
    return;
  }

  // buy
  const matches = await findMatches(extracted);
  if (matches.length > 0) {
    await logAction(dialog.id, 'match_shown', { company_ids: matches.map((m) => m.id) });
    const text = formatOffers(matches);
    await escalate(dialog, 'buyer_matches_found', {
      kind: 'buyer',
      hot: true,
      summary: `Покупатель: показано ${matches.length} вариантов (${matches.map((m) => `#${m.id}`).join(', ')})`,
      clientText,
      sendText: text,
    });
  } else {
    await escalate(dialog, 'buyer_no_matches', {
      kind: 'buyer',
      hot: true,
      summary: 'Покупатель: подходящих verified-карточек нет, нужен ручной подбор',
      clientText,
      sendText: TEMPLATES.escalated,
    });
  }
}

async function getOrCreateDialog(msg: WebhookMessage): Promise<DialogRow> {
  const [existing] = await sql`
    select id, avito_chat_id, status, intent, bot_messages_sent, extracted
    from dialogs where avito_chat_id = ${msg.chat_id}
  `;
  if (existing) return existing as unknown as DialogRow;

  const [created] = await sql`
    insert into dialogs (avito_chat_id, avito_item_id, client_author_id, status)
    values (${msg.chat_id}, ${msg.item_id ?? null}, ${msg.author_id}, 'new')
    on conflict (avito_chat_id) do update set updated_at = now()
    returning id, avito_chat_id, status, intent, bot_messages_sent, extracted
  `;
  return created as unknown as DialogRow;
}

/**
 * Обработка входящего сообщения (вызывается из waitUntil после раннего 200).
 * Guards по порядку раздела 9; решения принимает код, LLM только анализирует.
 */
export async function processMessage(payload: WebhookPayload): Promise<void> {
  try {
    await processInner(payload);
  } catch (e) {
    console.error('[bot] processMessage failed:', e);
    await notify(`❗ Ошибка обработки сообщения: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function processInner(payload: WebhookPayload): Promise<void> {
  const guard = guardMessage(payload);
  if (guard.kind === 'ignore') {
    // диагностика: фиксируем причину игнора (без текста сообщения)
    const v = payload?.payload?.value;
    await sql`
      insert into bot_actions (dialog_id, action, payload)
      values (null, 'webhook_ignored', ${JSON.stringify({
        reason: guard.reason,
        payload_type: payload?.payload?.type ?? null,
        msg_type: v?.type ?? null,
        chat_type: v?.chat_type ?? null,
        chat_id: v?.chat_id ?? null,
        author_id: v?.author_id ?? null,
        user_id: v?.user_id ?? null,
      })}::jsonb)
    `;
    return;
  }

  const msg = guard.msg;

  // blacklist → игнор
  const bl = await sql`select 1 from blacklist where author_id = ${msg.author_id}`;
  if (bl.length > 0) return;

  // идемпотентность по message.id
  const inserted = await sql`
    insert into processed_messages (avito_message_id, chat_id)
    values (${msg.id}, ${msg.chat_id})
    on conflict (avito_message_id) do nothing
    returning avito_message_id
  `;
  if (inserted.length === 0) return; // уже обработано

  const dialog = await getOrCreateDialog(msg);

  // терминальные статусы и INV-1: бот молчит, но входящие пишем в историю
  // (важно для исходящих кампаний: ответы продавцов попадают в базу)
  if (['escalated', 'rejected', 'closed'].includes(dialog.status)) {
    if (guard.kind === 'process') {
      await logAction(dialog.id, 'client_message', {
        text: msg.content!.text!.trim(),
        after_close: true,
      });
      await sql`update dialogs set updated_at = now() where id = ${dialog.id}`;
    }
    return;
  }
  if (dialog.bot_messages_sent >= config.bot.maxMessages) {
    await setDialog(dialog.id, { status: 'closed' });
    await logAction(dialog.id, 'closed_inv1', null);
    return;
  }

  // не-текст (link|location|image|voice) → эскалация
  if (guard.kind === 'escalate') {
    await logAction(dialog.id, 'client_nontext', { type: msg.type, reason: guard.reason });
    await escalate(dialog, guard.reason, { sendText: TEMPLATES.escalatedNoData });
    return;
  }

  const text = msg.content!.text!.trim();
  await logAction(dialog.id, 'client_message', { text });
  void markRead(msg.chat_id);

  // все сообщения клиента для контекста
  const history = await sql`
    select payload->>'text' as text from bot_actions
    where dialog_id = ${dialog.id} and action = 'client_message'
    order by id
  `;
  const clientMessages = history.map((h) => String(h.text)).filter(Boolean);

  const analysis = await analyzeDialog(clientMessages, dialog.extracted);

  // merge extracted (непустые новые значения поверх старых)
  const merged: Record<string, unknown> = { ...(dialog.extracted ?? {}) };
  for (const [k, v] of Object.entries(analysis.extracted)) {
    if (v !== null && v !== undefined && v !== '') merged[k] = v;
  }
  const intent = analysis.intent !== 'unclear' ? analysis.intent : (dialog.intent as 'sell' | 'buy' | null);
  await setDialog(dialog.id, { intent: intent ?? undefined, extracted: merged });
  dialog.extracted = merged;
  if (intent) dialog.intent = intent;

  // триггеры эскалации приоритетнее сценария
  if (analysis.escalate_reason) {
    const hot = ['price_talk', 'asks_contacts'].includes(analysis.escalate_reason);
    await escalate(dialog, analysis.escalate_reason, {
      hot,
      clientText: text,
      sendText: TEMPLATES.escalatedNoData,
    });
    return;
  }

  // машина состояний
  if (dialog.status === 'new') {
    if (analysis.has_enough && intent) {
      // все данные сразу → закрытие одним сообщением
      await finalize(dialog, intent, merged, text);
      return;
    }
    if (!intent) {
      // намерение неясно и триггеров нет → безопаснее передать человеку
      await escalate(dialog, 'unclear_intent', { clientText: text, sendText: TEMPLATES.escalatedNoData });
      return;
    }
    const questions = intent === 'sell' ? TEMPLATES.askSeller : TEMPLATES.askBuyer;
    const sent = await sendBotMessage(dialog, questions, 'questions_sent');
    if (sent) await setDialog(dialog.id, { status: 'awaiting_reply' });
    return;
  }

  if (dialog.status === 'awaiting_reply') {
    // сообщение №2 — решение в любом случае, вопросы НЕ досылаются (INV-3)
    if (analysis.has_enough && intent) {
      await finalize(dialog, intent, merged, text);
    } else if (intent) {
      await escalate(dialog, 'not_enough_data', {
        kind: intent === 'sell' ? 'seller' : 'buyer',
        summary: 'Данных не хватает после вопросов — передано человеку (INV-3)',
        clientText: text,
        sendText: TEMPLATES.escalatedNoData,
      });
    } else {
      await setDialog(dialog.id, { status: 'rejected' });
      await logAction(dialog.id, 'rejected', { reason: 'unclear_after_questions' });
      await sendBotMessage(dialog, TEMPLATES.rejected, 'rejection_message');
    }
    return;
  }
}
