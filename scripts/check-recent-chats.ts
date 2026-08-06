/** Последние чаты аккаунта: свежие сообщения видны? */
import { listChats } from '../lib/avito/client';

async function main() {
  const chats = await listChats(5, 0);
  for (const c of chats) {
    const updated = c.updated ? new Date(c.updated * 1000).toLocaleString('ru-RU') : '?';
    console.log(
      `чат ${c.id} | обновлён: ${updated} | объявление: ${(c.context?.value?.title ?? '—').slice(0, 50)} | последнее: ${(c.last_message?.content?.text ?? '—').slice(0, 80)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
