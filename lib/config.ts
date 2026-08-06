export const config = {
  avito: {
    clientId: process.env.AVITO_CLIENT_ID ?? '',
    clientSecret: process.env.AVITO_CLIENT_SECRET ?? '',
    userId: Number(process.env.AVITO_USER_ID ?? 0),
    webhookSecret: process.env.AVITO_WEBHOOK_SECRET ?? '',
    baseUrl: 'https://api.avito.ru',
    /** Белый список item_id объявлений, на которые отвечает бот (пусто = все) */
    allowedItemIds: (process.env.AVITO_ITEM_IDS ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  },
  db: {
    url: process.env.DATABASE_URL ?? '',
  },
  llm: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? 'google/gemini-2.5-flash',
  },
  bot: {
    tone: process.env.BOT_TONE ?? 'вы',
    /** INV-1: жёсткий потолок исходящих сообщений на диалог */
    maxMessages: 2,
    maxReplyLength: 1000,
  },
  dadata: {
    apiKey: process.env.DADATA_API_KEY ?? '',
    secretKey: process.env.DADATA_SECRET_KEY ?? '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: process.env.TELEGRAM_CHAT_ID ?? '',
    /** секрет в заголовке вебхука Telegram */
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    /** chat_id админов бота: могут добавлять компании и выдавать доступ */
    adminIds: (process.env.TELEGRAM_ADMIN_IDS ?? process.env.TELEGRAM_CHAT_ID ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n !== 0),
    /**
     * Что видит пользователь без роли partner:
     *  'full'      — полную карточку (название, ИНН, цена) — вся база открыта;
     *  'anonymous' — обезличенный список (регион, год, налог, обороты);
     *  'closed'    — только просьба запросить доступ.
     */
    guestAccess: (process.env.TELEGRAM_GUEST_ACCESS ?? 'anonymous') as
      | 'full'
      | 'anonymous'
      | 'closed',
  },
  admin: {
    user: process.env.ADMIN_USER ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },
};
