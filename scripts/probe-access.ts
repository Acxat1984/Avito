/** Стабильность доступа: 3 попытки чтения по каждому свежему чату + item_id. */
import { listChats, getChatMessages } from '../lib/avito/client';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chats = await listChats(8, 0);
  for (const c of chats) {
    const title = (c.context?.value?.title ?? '—').slice(0, 42);
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        const m = await getChatMessages(c.id, 5);
        results.push(`ok(${m.length})`);
      } catch (e) {
        const msg = (e as Error).message;
        results.push(msg.includes('402') ? '402' : msg.slice(0, 20));
      }
      await sleep(500);
    }
    console.log(`item ${c.context?.value?.id ?? '—'} | ${title.padEnd(44)} | ${results.join(' ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
