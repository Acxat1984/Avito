# Avito Assistant + Admin

Платформа из двух частей на одном стеке (см. `SPEC_v2.md` заказчика):

1. **Бот** — ассистент мессенджера Avito по модели «2 сообщения» (категория «Готовый бизнес»);
2. **Админка** — управление базой компаний: импорт из Excel, просмотр/редактирование, экспорт, лиды и диалоги.

Стек: Next.js (App Router, Node runtime) на Vercel + Neon (PostgreSQL) + OpenRouter (LLM) + Telegram.

## Инварианты бота

- **INV-1:** ≤ 2 исходящих сообщений на диалог (жёсткий счётчик в `sendBotMessage`).
- **INV-2:** никаких ссылок, телефонов, адресов, конкретных цен в исходящих (`violatesInv2` перед каждой отправкой).
- **INV-3:** не хватает данных → третье сообщение не досылается, диалог закрывается эскалацией/отказом.
- **INV-4:** ИНН и контакты продавца клиенту не раскрываются; подбор — только обезличенные карточки, текст собирается шаблоном из белого списка полей (`formatOffers`).

## Запуск

```bash
npm install
cp .env.example .env.local   # заполнить значения
# применить схему БД к Neon:
psql "$DATABASE_URL" -f lib/db/schema.sql
npm run dev
```

Админка: `http://localhost:3000/admin` (Basic Auth: `ADMIN_USER`/`ADMIN_PASSWORD`).

## Тесты

```bash
npm test          # vitest: нормализация, правило «import never blanks», guards, INV-2/INV-4
```

## Деплой и webhook

```bash
vercel deploy --prod
npx tsx scripts/register-webhook.ts https://<домен>
```

Webhook: `POST /api/avito/webhook/<AVITO_WEBHOOK_SECRET>` — ранний 200, обработка через `waitUntil`.

## Структура

```
app/api/avito/webhook/[secret]   webhook бота
app/api/admin/imports*           импорт: upload → staging → diff → apply/cancel
app/api/admin/export.xlsx|csv    экспорт с фильтрами таблицы
app/admin/*                      дашборд, компании, импорт, лиды, диалоги
lib/normalize/*                  ОБЩИЕ правила нормализации (импорт И бот) + regions.ts
lib/import/{parse,match,apply}   двухфазный импорт, «import never blanks»
lib/avito/{client,guards,types}  OAuth2 + обработка 401/402/403/429/5xx, guards
lib/dialog/{state,process}       шаблоны сообщений, машина состояний
lib/llm/{openrouter,prompts}     строгий JSON-анализ, решения принимает код
lib/telegram/notify.ts           алерты владельцу
middleware.ts                    Basic Auth на /admin и /api/admin
lib/db/schema.sql                схема Neon
```

## Доступ Avito (проверить до запуска)

- Messenger API — только на подписке «Расширенный»/«Максимальный» для Услуг; `403` → проверить уровень и тип ключа.
- Ключ — от аккаунта **компании**, не сотрудника.
- OAuth2 client_credentials, Token URL `https://api.avito.ru/token`, скоупы `messenger:read`, `messenger:write`.
