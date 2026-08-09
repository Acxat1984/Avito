import { config } from '@/lib/config';

/** Низкоуровневые вызовы Telegram Bot API. */

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TgMessage;
    from: TgUser;
  };
}

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  date: number;
}

async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[tg] ${method} → ${res.status}`, (await res.text()).slice(0, 200));
  }
  return res.json().catch(() => null);
}

export async function sendText(
  chatId: number | string,
  text: string,
  opts: {
    keyboard?: string[][];
    inline?: Array<Array<{ text: string; callback_data: string }>>;
    /** разметка HTML — только для наших справочных текстов, не для данных из БД */
    html?: boolean;
  } = {},
): Promise<void> {
  // Telegram режет сообщения длиннее 4096 символов
  const chunks = text.match(/[\s\S]{1,3900}/g) ?? [text];
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await call('sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      ...(opts.html ? { parse_mode: 'HTML' } : {}),
      ...(isLast && opts.keyboard
        ? { reply_markup: { keyboard: opts.keyboard, resize_keyboard: true } }
        : {}),
      ...(isLast && opts.inline ? { reply_markup: { inline_keyboard: opts.inline } } : {}),
    });
  }
}

export async function answerCallback(id: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, text });
}

/**
 * Отправка файла (multipart/form-data — JSON тут не подходит).
 * Используется для выгрузки таблицы компаний прямо в чат.
 */
export async function sendDocument(
  chatId: number | string,
  filename: string,
  content: Uint8Array,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  // копия буфера: Blob требует непрозрачный ArrayBuffer, а Uint8Array из
  // xlsx может ссылаться на пул большего размера
  form.append('document', new Blob([content.slice().buffer as ArrayBuffer]), filename);
  if (caption) form.append('caption', caption);

  const res = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
    { method: 'POST', body: form },
  );
  if (!res.ok) {
    console.error('[tg] sendDocument →', res.status, (await res.text()).slice(0, 200));
  }
}

export async function setWebhook(url: string, secretToken: string): Promise<unknown> {
  return call('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
  });
}
