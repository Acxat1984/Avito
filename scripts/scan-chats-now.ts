/** Обзор последних чатов: какие читаются, последние сообщения и кто их автор. */
import { listChats, getChatMessages } from '../lib/avito/client';
import { config } from '../lib/config';

async function main() {
  const chats = await listChats(8, 0);
  for (const c of chats) {
    const title = (c.context?.value?.title ?? '—').slice(0, 45);
    const updated = c.updated ? new Date(c.updated * 1000).toLocaleString('ru-RU') : '?';
    console.log(`\n=== чат ${c.id}\n    ${title} | обновлён ${updated}`);
    try {
      const msgs = await getChatMessages(c.id, 10);
      for (const m of msgs.slice(0, 6)) {
        const who = m.author_id === config.avito.userId ? 'МЫ' : `клиент(${m.author_id})`;
        const when = m.created ? new Date(m.created * 1000).toLocaleTimeString('ru-RU') : '?';
        console.log(`    [${when}] ${who} (${m.type}): ${(m.content?.text ?? '<не текст>').slice(0, 90)}`);
      }
    } catch (e) {
      console.log(`    ЧТЕНИЕ ЗАКРЫТО: ${(e as Error).message.slice(0, 60)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
