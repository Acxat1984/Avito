import { config } from '@/lib/config';
import { notify } from '@/lib/telegram/notify';
import { TokenResponse } from './types';

/**
 * Клиент Avito API: OAuth2 client_credentials с кэшем токена,
 * обработка ошибок по разделу 9:
 * 401 → refresh + retry; 402 → алерт «пополни аванс»; 403 → алерт «подписка/ключ»;
 * 429 / X-RateLimit-Remaining=0 → backoff; 5xx → 2 retry.
 */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchToken(): Promise<string> {
  const res = await fetch(`${config.avito.baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.avito.clientId,
      client_secret: config.avito.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Avito token error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    value: data.access_token,
    // обновляем за минуту до истечения
    expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function getToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return fetchToken();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AvitoApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Avito API ${status}: ${body}`);
  }
}

async function avitoFetch(
  path: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${config.avito.baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.ok) return res;

  const body = await res.text();

  if (res.status === 401 && attempt === 0) {
    await getToken(true);
    return avitoFetch(path, init, attempt + 1);
  }
  if (res.status === 402) {
    // Avito отдаёт 402 и при отсутствии подписки с API мессенджера, и при
    // нулевом авансе — показываем оригинальный текст ошибки
    await notify(`⚠️ Avito 402: ${body.slice(0, 200)}\nПроверьте подписку с API мессенджера и аванс.`, {
      dedupeKey: 'avito-402',
    });
    throw new AvitoApiError(402, body);
  }
  if (res.status === 403) {
    await notify(
      '⚠️ Avito: 403 — проверь уровень подписки (Расширенный/Максимальный) и тип ключа (аккаунт компании)',
      { dedupeKey: 'avito-403' },
    );
    throw new AvitoApiError(403, body);
  }
  if (res.status === 429 || res.headers.get('X-RateLimit-Remaining') === '0') {
    if (attempt < 2) {
      await sleep(1000 * 2 ** attempt);
      return avitoFetch(path, init, attempt + 1);
    }
    throw new AvitoApiError(res.status, body);
  }
  if (res.status >= 500 && attempt < 2) {
    await sleep(500 * (attempt + 1));
    return avitoFetch(path, init, attempt + 1);
  }
  throw new AvitoApiError(res.status, body);
}

/** Отправка текстового сообщения в чат. */
export async function sendMessage(chatId: string, text: string): Promise<void> {
  await avitoFetch(
    `/messenger/v1/accounts/${config.avito.userId}/chats/${chatId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ message: { text }, type: 'text' }),
    },
  );
}

/** Пометить чат прочитанным. */
export async function markRead(chatId: string): Promise<void> {
  try {
    await avitoFetch(
      `/messenger/v1/accounts/${config.avito.userId}/chats/${chatId}/read`,
      { method: 'POST' },
    );
  } catch (e) {
    // не критично
    console.warn('[avito] markRead failed:', e);
  }
}

export interface AvitoChat {
  id: string;
  context?: { value?: { id?: number; title?: string; url?: string } };
  users?: Array<{ id: number; name?: string }>;
  last_message?: { content?: { text?: string } };
  updated?: number;
}

/** Список чатов аккаунта (пагинация limit/offset). */
export async function listChats(limit = 100, offset = 0): Promise<AvitoChat[]> {
  const res = await avitoFetch(
    `/messenger/v2/accounts/${config.avito.userId}/chats?limit=${limit}&offset=${offset}`,
    { method: 'GET' },
  );
  const data = await res.json();
  return (data.chats ?? []) as AvitoChat[];
}

export interface AvitoChatMessage {
  id: string;
  author_id: number;
  type: string;
  content?: { text?: string };
  created?: number;
}

/** Сообщения чата (v3). */
export async function getChatMessages(chatId: string, limit = 100): Promise<AvitoChatMessage[]> {
  const res = await avitoFetch(
    `/messenger/v3/accounts/${config.avito.userId}/chats/${chatId}/messages/?limit=${limit}&offset=0`,
    { method: 'GET' },
  );
  const data = await res.json();
  if (Array.isArray(data)) return data as AvitoChatMessage[];
  return (data.messages ?? []) as AvitoChatMessage[];
}

/** Регистрация webhook v3 (используется скриптом register-webhook). */
export async function subscribeWebhook(url: string): Promise<void> {
  await avitoFetch('/messenger/v3/webhook', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}
