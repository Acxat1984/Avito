# Avito Assistant + Admin — техническое задание для реализации (v2)

> Платформа из двух частей на одном стеке:
> **(1) Бот** — ассистент мессенджера Avito по модели «2 сообщения»;
> **(2) Админка** — управление базой компаний: импорт из Excel, просмотр/редактирование, экспорт, лиды и диалоги.
> Стек: Next.js (App Router) на Vercel + Neon (PostgreSQL) + OpenRouter (LLM) + Telegram.
> Бот и админка работают с ОДНОЙ базой: бот пишет карточки продавцов и лиды, читает компании для подбора; админка — это интерфейс владельца к тем же таблицам.

---

## 0. Прочитать первым: экономика и инварианты бота

Avito в категории «Готовый бизнес» (вертикаль Услуги) берёт плату за каждый **целевой чат** (от 490 ₽). Чат становится целевым при **любом** из условий: обмен контактами; договорённость о встрече/адрес; **отправленная ссылка**; **5+ сообщений в чате**.

Инварианты (нарушение = провал приёмки):

- **INV-1:** бот отправляет ≤ 2 исходящих сообщений на диалог.
- **INV-2:** бот НИКОГДА не отправляет ссылки, телефоны, адреса, конкретную цену. Только человек.
- **INV-3:** не хватает данных → бот НЕ досылает третье сообщение; закрывает диалог (эскалация/отказ).
- **INV-4 (новый):** бот никогда не раскрывает клиенту ИНН и контакты продавца из базы. В подборе покупателю — только обезличенные карточки (регион, год, обороты, налоговый режим, диапазон цены «обсуждается»).

---

## 1. Требования к доступу Avito (проверить до кода)

- Messenger API — только на подписке: для Услуг «Расширенный» или «Максимальный». `403` на старте → проверить уровень подписки и тип ключа.
- Ключ — от аккаунта **компании**, не сотрудника.
- OAuth2 **client_credentials**, Token URL `https://api.avito.ru/token`, скоупы `messenger:read`, `messenger:write`.
- Base URL: `https://api.avito.ru/`.

---

## 2. Стек

| Слой | Технология | Примечание |
|---|---|---|
| Приложение | Next.js App Router, Node runtime | одно приложение: webhook + админка |
| Хостинг | Vercel | |
| Async | `waitUntil()` из `@vercel/functions` | webhook отвечает 200 ≤ 2 сек, LLM в фоне |
| БД | Neon PostgreSQL | `@neondatabase/serverless` |
| LLM | OpenRouter, модель за env | дефолт `google/gemini-2.5-flash` |
| Excel | SheetJS (`xlsx`) на сервере | импорт и экспорт |
| Уведомления | Telegram Bot API | |
| Админ-доступ | Basic Auth или пароль за env (MVP) | одна роль «владелец»; NextAuth — фаза 2 |

---

## 3. Модель данных (Neon / PostgreSQL)

Ключевой принцип: **raw + normalized**. Исходные значения из Excel не теряются; нормализация кладётся рядом; что не распарсилось — флаг `needs_review` для ручной правки в админке.

```sql
create table companies (
  id              bigserial primary key,
  -- идентификация
  inn             text,                 -- нормализованный: только цифры (замена латиницы O→0 и т.п.), либо null
  inn_raw         text,                 -- как в файле: 'O600010917', 'По запросу'
  name            text not null,
  -- продавец (закрытые данные, никогда не отдаются боту в ответы клиенту — INV-4)
  seller_contact  text,
  -- нормализованные поля для фильтрации
  region_code     text,                 -- ключ из справочника регионов: 'msk','rt','kzn',...
  city_raw        text,                 -- 'миас (челяб)', 'Рт челны '
  year_reg        int,                  -- 2006..2026, null если не распарсили
  year_raw        text,                 -- '08.24', '15.03.23г', '2021-09-27 00:00:00'
  turnover_note   text,                 -- исходный текст оборотов: '23-4млн; 24-12млн'
  turnover_last_m numeric,              -- оборот последнего года в млн, если удалось извлечь
  price_k         numeric,              -- цена в ТЫСЯЧАХ ₽ (числа в файле — тысячи), null если 'Дог'
  price_raw       text,                 -- '100 (торг)', '40 не хочет', 'Дог'
  buy_price_k     numeric,              -- цена закупа (колонка почти пустая, но поле нужно)
  tax_system      text,                 -- enum-подобное: 'osno' | 'usn6' | 'usn_dr' | 'ausn' | null
  tax_raw         text,                 -- 'усн (хотят на осно)', '0.06', 'На осно готов'
  extra           text,                 -- колонка «дополнительно»: банки, лицензии, адрес
  has_license     boolean default false,-- эвристика по extra/доп.колонкам ('лицензия')
  banks           text,                 -- извлечённые банки из extra, опционально
  -- служебные
  status          text not null default 'draft',  -- draft | verified | reserved | sold | archived
  source          text not null default 'import', -- import | avito_bot | manual
  needs_review    boolean default false,          -- что-то не распарсилось
  review_notes    text,                            -- почему needs_review (список проблем)
  dialog_id       bigint,                          -- если карточку создал бот — ссылка на диалог
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on companies (region_code);
create index on companies (status);
create index on companies (needs_review);
create index on companies (inn);

-- журнал импортов (для отката и аудита)
create table imports (
  id           bigserial primary key,
  filename     text,
  uploaded_by  text,
  stats        jsonb,      -- {inserted, updated, skipped, errors:[...]}
  status       text default 'pending',  -- pending | applied | cancelled
  created_at   timestamptz default now()
);

-- строки импорта до применения (staging для preview/diff)
create table import_rows (
  id          bigserial primary key,
  import_id   bigint references imports(id) on delete cascade,
  row_num     int,
  raw         jsonb,       -- исходная строка как есть
  parsed      jsonb,       -- нормализованная версия
  match_company_id bigint, -- найденное совпадение (по ИНН/имени), null = новая
  action      text,        -- insert | update | skip | conflict
  problems    text[]       -- ['год не распарсился', 'ИНН содержит латиницу O']
);

-- история изменений карточек (кто/когда/что) — для админки
create table company_audit (
  id          bigserial primary key,
  company_id  bigint references companies(id) on delete cascade,
  actor       text,        -- 'admin' | 'bot' | 'import:<id>'
  changes     jsonb,       -- {field: {old, new}}
  created_at  timestamptz default now()
);

-- ===== таблицы бота (без изменений против v1, приводятся для полноты) =====
create table dialogs (
  id                bigserial primary key,
  avito_chat_id     text unique not null,
  avito_item_id     bigint,
  client_author_id  bigint not null,
  intent            text,               -- sell | buy | unclear
  status            text default 'new', -- new|awaiting_reply|escalated|rejected|closed
  bot_messages_sent int default 0,
  extracted         jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create table processed_messages (
  avito_message_id text primary key,
  chat_id          text,
  processed_at     timestamptz default now()
);
create table bot_actions (
  id         bigserial primary key,
  dialog_id  bigint references dialogs(id),
  action     text,
  payload    jsonb,
  created_at timestamptz default now()
);
create table leads (
  id         bigserial primary key,
  dialog_id  bigint references dialogs(id),
  kind       text,        -- buyer | seller
  hot        boolean default false,
  summary    text,
  company_id bigint references companies(id),  -- если продавец → созданная карточка
  created_at timestamptz default now()
);
create table blacklist (
  author_id  bigint primary key,
  reason     text,
  created_at timestamptz default now()
);
```

---

## 4. Нормализация импорта (самая тонкая часть — реализовать строго по правилам)

Файл заказчика: лист `Лист1`, колонки: `название и инн`, `инн`, `продавец, тел`, `обороты`, `цена закупа`, `цена`, `система налог`, `город`, `год`, `дополнительно`, возможен хвост `Unnamed: N` (туда иногда пишут заметки — конкатенировать в `extra`).

### 4.1. ИНН → `inn` + `inn_raw`
- Trim; сохранить raw.
- Замена похожих латинских букв на цифры: `O,o → 0`; после замены — оставить только `\d`.
- Валидная длина ИНН: 10 (юрлицо) или 12 (ИП). Иная длина → `inn = null`, `needs_review`, problem `ИНН нестандартной длины`.
- `По запросу` и любые нецифровые → `inn = null`, raw сохраняется, review НЕ ставить (это осознанное «скрыто»), но в problems пометить `ИНН по запросу`.

### 4.2. Год → `year_reg` + `year_raw`
Порядок попыток (первая сработавшая):
1. Excel-дата / ISO (`2021-09-27 00:00:00`) → взять год.
2. `dd.mm.yyг` / `dd.mm.yy` / `mm.yy` (например `15.03.23г`, `08.24`) → две последние цифры года → 20xx.
3. Чистое 4-значное число 1990–2026 → как есть.
4. 1–2-значное число: `5→2005`, `22→2022` (0–26 → 20xx; 90–99 → 19xx).
5. Хвостовые `г`/`г.` отбрасывать до парсинга.
Не распарсилось → `year_reg = null`, `needs_review`.

### 4.3. Город → `region_code` + `city_raw`
- lower + trim + схлопнуть пробелы; сохранить raw.
- Справочник синонимов (файл `lib/import/regions.ts`), стартовый набор из реальных данных:
  `мск|москва|моск обл|московская обл → msk`; `кзн|казань → kzn`; `рт|рт челны|рт, зеленодольск|челны|елабуга → rt`; `нн|нижний|но → nn`; `екб → ekb`; `спб|питер → spb`; `уфа|рб|рб стерлитамак|нефтекамск рб → rb`; `киров|кир обл → kirov`; `новосиб → nsk`; `тюмень → tmn`; `пермь|пермский → perm`; `самара → samara`; `саратов|саратовская → saratov`; `ульяновск → uln`; `ижевск → izh`; `саранск → mordovia`; `чувашия → chuv`; `йошка → mari`; `владик → vld`; `миас (челяб)|магнитогорск → chel`; `оренбург → oren`; `белгород → bel`; `краснодар|сочи|анапа → krasnodar`; `череповец → vologda`; `иваново → ivanovo`; `ноябрьск → yanao`; `назрань|чечня → kavkaz`; `кузбасс → kem`.
- Нет в справочнике → `region_code = null`, `needs_review`, problem `город не распознан: <raw>`. Справочник редактируется в коде; админка показывает нераспознанные для пополнения.

### 4.4. Цена → `price_k` + `price_raw`
- Извлечь первое число из строки (`100 (торг)` → 100; `40 не хочет` → 40). Числа в файле — ТЫСЯЧИ ₽.
- `Дог`, пусто, нет числа → `price_k = null` (это норма, не review).
- Пометки `торг`, `не хочет` остаются в raw и видны в админке.

### 4.5. Налоговый режим → `tax_system` + `tax_raw`
- lower + trim. Маппинг:
  - содержит `осно` или равно `на осно готов` → `osno`;
  - `аусн` → `ausn`;
  - `усн` + (`6` | `доход` без `-р`) или равно `0.06` | `6` → `usn6`;
  - `усн` + (`д-р` | `д р` | `доход-расход`) или равно `0.15` | `д-р` → `usn_dr`;
  - просто `усн` без уточнения → `usn6` + problem `УСН без уточнения, принят 6%`(не review, только заметка);
  - скобочные оговорки (`хотят на осно`, `с нг на ндс`) → в `review_notes`, режим по основному токену.
- Не распознан → null + `needs_review`.

### 4.6. Обороты → `turnover_note` + `turnover_last_m`
- Полный текст в `turnover_note` как есть.
- Попытаться извлечь оборот последнего упомянутого года: паттерн `(\d{2})\s*[-–]\s*([\d.,]+)\s*(млн)?` по всем совпадениям, взять с максимальным годом → число в млн. `0`, `Мин`, `До 16г` → null. Ошибки не считаются review — поле опциональное.

### 4.7. «Дополнительно» и хвостовые колонки → `extra`, `has_license`, `banks`
- `extra` = конкатенация «дополнительно» + все непустые `Unnamed:*` через `; `.
- `has_license = true`, если в extra есть подстрока `лиценз` (регистронезависимо).
- `banks`: извлечь известные токены (`сбер, альфа, втб, точка, озон, отп, тинькофф/т-банк, райф`) в список через запятую; остальное не трогать.

---

## 5. Импорт: workflow «загрузил → diff → применил»

Импорт НЕ применяется сразу. Двухфазный процесс со staging:

### Фаза 1 — Upload & Parse
`POST /api/admin/imports` (multipart, .xlsx)
1. Прочитать первый лист SheetJS-ом. Валидация: обязательные колонки `название и инн`, `инн` присутствуют (по включению, регистронезависимо). Нет → 422 со списком найденных колонок.
2. Каждую строку прогнать через нормализацию (раздел 4) → `import_rows.parsed` + `problems`.
3. **Матчинг с существующими** (порядок):
   - по нормализованному `inn` (если оба не null) → `action = update`;
   - иначе по точному `lower(trim(name))` → `action = update` + problem `совпадение по имени, ИНН отсутствует`;
   - иначе → `action = insert`.
   - Если у совпавшей записи `source = 'avito_bot'` и есть `dialog_id` → `action = conflict` (карточку создал бот, слепая перезапись запрещена — решает человек в админке).
4. Пустые строки (нет name и inn) → `action = skip`.
5. Ответ: `{import_id, stats: {insert, update, skip, conflict, with_problems}}`.

### Фаза 2 — Review & Apply
- `GET /api/admin/imports/{id}` — постранично строки staging с diff: для `update` показать поле-к-полю old→new (менять только непустые новые значения; пустая ячейка Excel НЕ затирает существующее значение — правило «import never blanks»).
- `POST /api/admin/imports/{id}/apply` — транзакционно применить: insert'ы и update'ы; каждая правка пишется в `company_audit` с actor `import:<id>`; conflict-строки пропускаются (остаются в staging со статусом conflict, разруливаются вручную).
- `POST /api/admin/imports/{id}/cancel` — отменить, staging остаётся для истории.

UI импорта (страница `/admin/imports`):
- дропзона для .xlsx → после загрузки таблица предпросмотра с фильтром по action/problems;
- кнопки «Применить», «Отменить»;
- история импортов со статистикой.

---

## 6. Экспорт (скачивание таблицы)

`GET /api/admin/export.xlsx?[filters]` — генерирует .xlsx на лету (SheetJS):
- Колонки в формате, привычном заказчику (те же заголовки, что во входном файле) + служебные: `статус`, `источник`, `требует проверки`, `id`.
- Уважает те же фильтры, что таблица админки (регион, статус, налоговый режим, needs_review, поиск).
- Отдаёт `Content-Disposition: attachment; filename="companies_YYYY-MM-DD.xlsx"`.
- Экспорт полный (raw-поля), потому что скачивает владелец. Никогда не встраивать этот endpoint в ответы бота (INV-4).

Дополнительно `GET /api/admin/export.csv` с теми же параметрами — дёшево, полезно.

---

## 7. Админка (страницы)

Базовый путь `/admin`, защита: middleware с Basic Auth (`ADMIN_USER`/`ADMIN_PASSWORD` из env). Всё server components + server actions, без тяжёлого клиентского стейта.

| Страница | Содержимое |
|---|---|
| `/admin` | Дашборд: счётчики (компаний по статусам, needs_review, лидов за неделю, диалогов, расход сообщений бота), последние эскалации |
| `/admin/companies` | Таблица компаний: поиск (name/inn), фильтры (region, status, tax_system, needs_review, source), сортировка, пагинация (50/стр). Кнопки: экспорт, «+ компания» |
| `/admin/companies/[id]` | Карточка: все поля редактируемые (raw — read-only рядом с normalized), история из `company_audit`, связанный диалог/лид если source=avito_bot. Смена статуса draft→verified — главное действие владельца |
| `/admin/imports` | Импорт: дропзона, предпросмотр diff, применить/отменить, история |
| `/admin/leads` | Лиды: kind, hot, summary, ссылка на диалог и карточку; отметка «обработан» |
| `/admin/dialogs` | Диалоги: статус, intent, счётчик сообщений бота, extracted; просмотр переписки (история из нашей БД `bot_actions` + опционально подтяжка через GET messages Avito) |

Редактирование в `/admin/companies/[id]`:
- каждая правка → `company_audit` (actor `admin`);
- при сохранении нормализованных полей руками сбрасывать `needs_review = false`, если админ отметил «проверено»;
- удаление = смена статуса на `archived` (никаких физических delete — на карточку могут ссылаться лиды).

---

## 8. Как бот работает с базой компаний (связь модулей)

### 8.1. Ветка ПРОДАВЕЦ → запись в базу
Когда диалог продавца закрывается эскалацией с достаточными данными, `processMessage`:
1. создаёт запись в `companies`: `source='avito_bot'`, `status='draft'`, `needs_review=true`, `dialog_id`, заполненные из `extracted` поля (через ТЕ ЖЕ функции нормализации из раздела 4 — они общие в `lib/normalize/`);
2. создаёт `leads (kind='seller', company_id=...)`;
3. Telegram-алерт со ссылкой на карточку в админке.
Карточки от бота НИКОГДА не попадают в подбор, пока владелец не переведёт их в `verified`.

### 8.2. Ветка ПОКУПАТЕЛЬ → чтение из базы
Подбор: `select ... from companies where status='verified'` + фильтры из extracted (region_code, year_reg диапазон, tax_system, price_k ≤ бюджет, has_license). Максимум 3 результата, отсортировать по свежести.
**Формат выдачи клиенту (INV-4):** только `регион (текстом), год регистрации, налоговый режим, оборот примерно, «цена обсуждается»`. Ни名, ни ИНН, ни цены числом, ни контактов. Текст собирается ШАБЛОНОМ в коде (не LLM) из белого списка полей — это гарантия инварианта.
Результат подбора пишется в `bot_actions` (payload: какие company_id показаны) — владелец в админке видит, что кому предлагалось.

---

## 9. Бот: webhook, guards, машина состояний (без изменений против v1 — кратко)

- `POST /api/avito/webhook/[secret]` → валидация; **ранний `200`**; `waitUntil(processMessage())`.
- Guards по порядку: невалидный payload → игнор; `author_id == user_id` (своё) → игнор (защита от петли); `type != text` (`system` c `flow_id` → игнор; `link|location|image` от клиента → эскалация; `voice` → эскалация); `chat_type != u2i` → игнор; blacklist → игнор; идемпотентность по `message.id` через `processed_messages`.
- Машина состояний: `new` → (данных хватает? сразу решение одним сообщением : вопросы, `awaiting_reply`) → `awaiting_reply` → решение сообщением №2 → `escalated|rejected`. Счётчик `bot_messages_sent`, при `>=2` бот молчит.
- Триггеры эскалации приоритетнее сценария: просьба человека; юр.вопросы/«схемы»/номиналы; торг/запрос цены; запрос контактов; неуверенный парсинг.
- LLM (OpenRouter): вызовы A/B возвращают строгий JSON `{intent, escalate_reason, extracted, has_enough}`; решения принимает код; тексты «передаю специалисту»/«отказ» — шаблоны в коде; ответ ≤ 1000 символов.
- Avito client: send `POST /messenger/v1/accounts/{user_id}/chats/{chat_id}/messages` body `{"message":{"text":"..."},"type":"text"}`; read `POST .../read`; token client_credentials с кэшем; ошибки: `401` → refresh+retry; `402` → Telegram-алерт «пополни аванс»; `403` → алерт «подписка/ключ»; `429`/`X-RateLimit-Remaining=0` → backoff; `5xx` → 2 retry → эскалация.

---

## 10. Структура проекта

```
/app
  /api/avito/webhook/[secret]/route.ts
  /api/admin/imports/route.ts               # POST upload
  /api/admin/imports/[id]/route.ts          # GET preview
  /api/admin/imports/[id]/apply/route.ts    # POST
  /api/admin/imports/[id]/cancel/route.ts   # POST
  /api/admin/export.xlsx/route.ts           # GET
  /api/health/route.ts
  /admin/(layout с Basic Auth middleware)
    page.tsx                                # дашборд
    companies/page.tsx
    companies/[id]/page.tsx
    imports/page.tsx
    leads/page.tsx
    dialogs/page.tsx
/lib
  avito/{client,types,guards}.ts
  llm/{openrouter,prompts}.ts
  dialog/{state,process}.ts
  normalize/                                # ОБЩИЕ функции нормализации (импорт И бот)
    {inn,year,region,price,tax,turnover,extra}.ts
    regions.ts                              # справочник синонимов городов
  import/{parse,match,apply}.ts
  export/xlsx.ts
  db/{schema.sql,queries.ts}
  telegram/notify.ts
  config.ts
/scripts
  register-webhook.ts
/middleware.ts                              # Basic Auth на /admin и /api/admin
```

---

## 11. Env

```
AVITO_CLIENT_ID= / AVITO_CLIENT_SECRET= / AVITO_USER_ID= / AVITO_WEBHOOK_SECRET=
DATABASE_URL=
OPENROUTER_API_KEY= / LLM_MODEL=google/gemini-2.5-flash
BOT_TONE=вы
TELEGRAM_BOT_TOKEN= / TELEGRAM_CHAT_ID=
ADMIN_USER= / ADMIN_PASSWORD=
```

---

## 12. Порядок реализации

1. Скелет + `schema.sql` в Neon + health + Basic Auth middleware.
2. `lib/normalize/*` со всеми правилами раздела 4 + **юнит-тесты на реальных примерах из файла** (это фундамент и импорта, и бота).
3. Импорт: upload→staging→diff→apply + страница `/admin/imports`.
4. Админка: companies list + карточка + audit + экспорт xlsx.
5. Клиент Avito + webhook + guards + идемпотентность.
6. Машина состояний + LLM + шаблоны сообщений.
7. Связка бота с базой: запись продавцов (8.1), подбор покупателю (8.2).
8. Leads/dialogs страницы + Telegram.
9. Smoke-тест на тестовом чате, приёмка.

---

## 13. Тесты приёмки

Бот (из v1): петля (`author_id==user_id` → 0 исходящих); INV-1 (4 входящих → ≤2 исходящих); INV-2 (regex: нет URL/телефонов/цен в исходящих); `system+flow_id` → игнор; 402 → алерт; идемпотентность; «все данные сразу» → закрытие 1 сообщением; webhook 200 ≤ 2 сек.

Нормализация (юнит, на реальных значениях из файла):
- год: `22→2022`, `2006→2006`, `08.24→2024`, `15.03.23г→2023`, `2021-09-27 00:00:00→2021`, `5→2005`, `мусор→null+review`;
- ИНН: `O600010917→0600010917` (10 цифр, валиден), `По запросу→null без review`, `264081370` (9 цифр) → null+review;
- город: `Рт челны →rt`, `миас (челяб)→chel`, `йошка→mari`, `Мытищи→null+review`;
- цена: `100 (торг)→100`, `40 не хочет→40`, `Дог→null`;
- налог: `0.06→usn6`, `На осно готов→osno`, `усн (с нг на ндс)→usn6+note`, `Д-р→usn_dr`.

Импорт:
- повторный импорт того же файла → 0 insert, N update/скипов (идемпотентность по ИНН);
- пустая ячейка не затирает заполненное поле («import never blanks»);
- конфликт с карточкой бота → строка conflict, не применяется автоматически;
- файл без колонки `инн` → 422 с внятной ошибкой.

Админка/связка:
- правка карточки → запись в `company_audit`;
- карточка от бота имеет `source=avito_bot`, `status=draft` и не попадает в подбор;
- подбор возвращает только `verified` и только обезличенные поля (тест на белый список);
- экспорт с фильтром отдаёт xlsx, открывающийся в Excel, с теми же строками, что в таблице.

---

## Приложение A. Наборы вопросов бота (шаблоны, ≤1000 символов)
Продавцу: форма (ООО/АО), регион, год регистрации, налоговый режим, обороты по годам, счета/банки, долги/блокировки/суды, лицензии, адрес (жилой/нежилой), причина продажи, желаемая цена. Покупателю: цель приобретения (обязательно), регион, форма, нужны ли обороты/возраст, счета, лицензии, бюджет. Просить ответ одним сообщением; не досылать уточнения (INV-3).

## Приложение B. Текст объявления
В описание объявления вынести инструкцию присылать данные первым сообщением — переносит сбор данных в бесплатную зону и часто позволяет закрыть диалог одним сообщением.

## Приложение C. Открытые вопросы к менеджеру Avito
1. «5 сообщений» — суммарно или только от клиента? 2. Названная цена — целевое действие? 3. Точная цена целевого чата. 4. Точный уровень подписки для Messenger API в категории.
