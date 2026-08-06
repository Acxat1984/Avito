/**
 * Исходящая кампания по компаниям «каскад и ниже» (draft, строки 35+ из 11.xlsx):
 * найти в чатах Avito переписку с компанией по ИНН и отправить один вопрос
 * об актуальности. Ответы бот не комментирует (диалог = closed), только пишет в БД.
 * Запуск: env из .env.local, затем npx tsx scripts/outreach-11.ts
 */
import { neon } from '@neondatabase/serverless';
import { listChats, getChatMessages, sendMessage } from '../lib/avito/client';
import { config } from '../lib/config';

const sql = neon(process.env.DATABASE_URL!);

const OUTREACH_TEXT =
  'Здравствуйте! Актуальна ли продажа фирмы? Уточните цену продажи. Напишите ваш номер телефона.';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const companies = (await sql`
    select id, name, inn, inn_raw, dialog_id from companies
    where status = 'draft' and review_notes like 'ожидает актуализации%'
    order by id
  `) as unknown as Array<{
    id: number; name: string; inn: string | null; inn_raw: string | null; dialog_id: number | null;
  }>;

  const withInn = companies.filter((c) => c.inn);
  console.log(`Компаний в кампании: ${companies.length}, с валидным ИНН: ${withInn.length}`);
  const noInn = companies.filter((c) => !c.inn);
  if (noInn.length) console.log(`Без ИНН (поиск невозможен): ${noInn.map((c) => c.name).join(', ')}`);

  // 1. Собираем все чаты аккаунта
  const chats: Awaited<ReturnType<typeof listChats>> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await listChats(100, offset);
    chats.push(...page);
    console.log(`чатов загружено: ${chats.length}`);
    if (page.length < 100) break;
    await sleep(300);
  }

  // 2. Ищем ИНН в сообщениях каждого чата (чаты идут от свежих к старым)
  const matched = new Map<number, { chatId: string; clientId: number | null }>(); // companyId → chat
  let scanned = 0;
  for (const chat of chats) {
    if (matched.size === withInn.length) break;
    scanned++;
    let text = chat.context?.value?.title ?? '';
    try {
      const messages = await getChatMessages(chat.id);
      text += ' ' + messages.map((m) => m.content?.text ?? '').join(' ');
    } catch (e) {
      console.warn(`  не удалось прочитать чат ${chat.id}: ${e instanceof Error ? e.message : e}`);
    }
    for (const c of withInn) {
      if (matched.has(c.id)) continue;
      if (text.includes(c.inn!)) {
        const client = chat.users?.find((u) => u.id !== config.avito.userId);
        matched.set(c.id, { chatId: chat.id, clientId: client?.id ?? null });
        console.log(`  ✓ ${c.name} (ИНН ${c.inn}) → чат ${chat.id}`);
      }
    }
    if (scanned % 20 === 0) console.log(`просканировано чатов: ${scanned}/${chats.length}, найдено: ${matched.size}`);
    await sleep(250);
  }
  console.log(`\nПоиск завершён: просканировано ${scanned} чатов, найдено совпадений: ${matched.size}`);

  // 3. Отправляем сообщение и фиксируем в БД
  let sent = 0;
  let skipped = 0;
  for (const c of withInn) {
    const m = matched.get(c.id);
    if (!m) continue;
    if (c.dialog_id) {
      console.log(`  пропуск (уже отправляли): ${c.name}`);
      skipped++;
      continue;
    }
    try {
      await sendMessage(m.chatId, OUTREACH_TEXT);
      const [dlg] = await sql`
        insert into dialogs (avito_chat_id, client_author_id, intent, status, bot_messages_sent)
        values (${m.chatId}, ${m.clientId ?? 0}, 'sell', 'closed', 1)
        on conflict (avito_chat_id) do update set status = 'closed', updated_at = now()
        returning id
      `;
      await sql`
        insert into bot_actions (dialog_id, action, payload)
        values (${dlg.id}, 'outreach_sent', ${JSON.stringify({ company_id: c.id, inn: c.inn, text: OUTREACH_TEXT })}::jsonb)
      `;
      await sql`
        update companies set
          dialog_id = ${dlg.id},
          review_notes = review_notes || '; запрос отправлен в Avito',
          updated_at = now()
        where id = ${c.id}
      `;
      sent++;
      console.log(`  → отправлено: ${c.name}`);
      await sleep(1000);
    } catch (e) {
      console.error(`  ✗ ошибка отправки для ${c.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const unmatched = withInn.filter((c) => !matched.has(c.id));
  console.log(`\n===== ИТОГ =====`);
  console.log(`Компаний в кампании: ${companies.length} (с ИНН: ${withInn.length})`);
  console.log(`Найдено диалогов по ИНН: ${matched.size}`);
  console.log(`Отправлено сообщений: ${sent}${skipped ? ` (пропущено повторных: ${skipped})` : ''}`);
  if (unmatched.length) {
    console.log(`Диалог не найден (${unmatched.length}): ${unmatched.map((c) => c.name).join(', ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
