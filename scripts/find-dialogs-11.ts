/**
 * ПОИСК БЕЗ ОТПРАВКИ: есть ли диалоги с компаниями кампании (draft, 35+).
 * Ищем ИНН и название в доступных без полной подписки данных чата:
 * заголовок объявления + текст последнего сообщения.
 * Запуск: env из .env.local, затем npx tsx scripts/find-dialogs-11.ts
 */
import { neon } from '@neondatabase/serverless';
import { listChats, getChatMessages } from '../lib/avito/client';

const sql = neon(process.env.DATABASE_URL!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const normName = (s: string) =>
  s.toLowerCase().replace(/["«»']/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const companies = (await sql`
    select id, name, inn from companies
    where status = 'draft' and review_notes like 'ожидает актуализации%'
    order by id
  `) as unknown as Array<{ id: number; name: string; inn: string | null }>;
  console.log(`Компаний в кампании: ${companies.length}`);

  const chats = [];
  // Avito отдаёт максимум 1000 чатов (offset >= 1000 → 400)
  for (let offset = 0; offset < 1000; offset += 100) {
    try {
      const page = await listChats(100, offset);
      chats.push(...page);
      if (page.length < 100) break;
    } catch {
      break;
    }
    await sleep(300);
  }
  console.log(`Чатов у аккаунта: ${chats.length}`);

  // полный текст каждого чата: заголовок + вся переписка (API мессенджера)
  const found: Array<{ name: string; inn: string | null; chatId: string; via: string; title: string }> = [];
  const matchedIds = new Set<number>();
  let scanned = 0;
  for (const chat of chats) {
    if (matchedIds.size === companies.length) break;
    scanned++;
    const title = chat.context?.value?.title ?? '';
    let hay = `${title} ${chat.last_message?.content?.text ?? ''}`;
    try {
      const messages = await getChatMessages(chat.id);
      hay += ' ' + messages.map((m) => m.content?.text ?? '').join(' ');
    } catch (e) {
      console.warn(`  чат ${chat.id} не прочитан: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
    const hayNorm = normName(hay);
    for (const c of companies) {
      if (matchedIds.has(c.id)) continue;
      const cname = normName(c.name).replace(/\s+не готова$/, '');
      if (c.inn && hay.includes(c.inn)) {
        matchedIds.add(c.id);
        found.push({ name: c.name, inn: c.inn, chatId: chat.id, via: 'ИНН', title: title.slice(0, 60) });
      } else if (cname.length >= 5 && hayNorm.includes(cname)) {
        matchedIds.add(c.id);
        found.push({ name: c.name, inn: c.inn, chatId: chat.id, via: 'название', title: title.slice(0, 60) });
      }
    }
    if (scanned % 50 === 0) console.log(`просканировано: ${scanned}/${chats.length}, найдено: ${found.length}`);
    await sleep(200);
  }

  console.log(`\n===== НАЙДЕНО: ${found.length} из ${companies.length} (просканировано чатов: ${scanned}) =====`);
  for (const f of found) console.log(`  ${f.name} (${f.inn ?? 'без ИНН'}) → [${f.via}] чат ${f.chatId} | ${f.title}`);
  const missed = companies.filter((c) => !matchedIds.has(c.id));
  console.log(`\nНе найдено (${missed.length}): ${missed.map((c) => c.name).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
