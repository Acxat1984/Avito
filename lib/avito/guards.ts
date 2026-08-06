import { config } from '@/lib/config';
import { WebhookPayload, WebhookMessage } from './types';

export type GuardResult =
  | { kind: 'ignore'; reason: string }
  | { kind: 'escalate'; reason: string; msg: WebhookMessage }
  | { kind: 'process'; msg: WebhookMessage };

/**
 * Guards раздела 9 (по порядку). Blacklist и идемпотентность проверяются
 * дальше в processMessage (нужна БД).
 */
export function guardMessage(payload: WebhookPayload): GuardResult {
  const msg = payload?.payload?.value;
  if (!msg || payload.payload?.type !== 'message' || !msg.id || !msg.chat_id) {
    return { kind: 'ignore', reason: 'invalid_payload' };
  }

  // защита от петли: своё сообщение
  if (msg.author_id === config.avito.userId || msg.author_id === msg.user_id) {
    return { kind: 'ignore', reason: 'own_message' };
  }

  // бот работает только с объявлениями из белого списка (например, «Продам ООО»);
  // квартиры, мониторы и прочие объявления — игнор ДО любых реакций
  if (
    config.avito.allowedItemIds.length > 0 &&
    (!msg.item_id || !config.avito.allowedItemIds.includes(msg.item_id))
  ) {
    return { kind: 'ignore', reason: `foreign_item:${msg.item_id ?? 'none'}` };
  }

  if (msg.type !== 'text') {
    if (msg.type === 'system') {
      return { kind: 'ignore', reason: 'system_message' };
    }
    if (['link', 'location', 'image'].includes(msg.type)) {
      return { kind: 'escalate', reason: `non_text:${msg.type}`, msg };
    }
    if (msg.type === 'voice') {
      return { kind: 'escalate', reason: 'voice', msg };
    }
    return { kind: 'ignore', reason: `unsupported_type:${msg.type}` };
  }

  if (msg.chat_type && msg.chat_type !== 'u2i') {
    return { kind: 'ignore', reason: `chat_type:${msg.chat_type}` };
  }

  if (!msg.content?.text?.trim()) {
    return { kind: 'ignore', reason: 'empty_text' };
  }

  return { kind: 'process', msg };
}
