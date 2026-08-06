import { config } from '@/lib/config';

/**
 * Уведомления владельцу в Telegram. Ошибки глотаем с логом —
 * алерт не должен ронять обработку сообщения.
 * Анти-спам: одинаковые алерты не чаще одного раза в 15 минут
 * (ключ — dedupeKey или первые 80 символов текста).
 */
const lastSent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export async function notify(text: string, opts: { dedupeKey?: string } = {}): Promise<void> {
  const key = opts.dedupeKey ?? text.slice(0, 80);
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < DEDUPE_WINDOW_MS) return;
  lastSent.set(key, now);

  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    console.warn('[telegram] не настроен, сообщение:', text);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // без parse_mode: текст содержит цитаты клиента, символы < > & в них
      // ломали HTML-разметку, и Telegram отклонял алерт (400)
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.error('[telegram] ошибка отправки:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[telegram] ошибка отправки:', e);
  }
}
