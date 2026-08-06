-- Avito Assistant + Admin — схема БД (Neon / PostgreSQL)
-- Применение: psql "$DATABASE_URL" -f lib/db/schema.sql

create table if not exists companies (
  id              bigserial primary key,
  -- идентификация
  inn             text,                 -- нормализованный: только цифры, либо null
  inn_raw         text,                 -- как в файле: 'O600010917', 'По запросу'
  name            text not null,
  -- продавец (закрытые данные, никогда не отдаются боту в ответы клиенту — INV-4)
  seller_contact  text,
  -- нормализованные поля для фильтрации
  region_code     text,
  city_raw        text,
  year_reg        int,
  year_raw        text,
  turnover_note   text,
  turnover_last_m numeric,
  turnovers       jsonb default '{}'::jsonb,  -- обороты по годам в млн: {"2023":92,"2024":82.2}
  employees       int,
  zska            text,                 -- светофор ЗСК: зелёный | жёлтый | красный
  okved           text,
  address         text,                 -- фактический адрес (офис/жилой)
  price_note      text,                 -- приписка к цене: 'нотариат', 'торг'
  price_k         numeric,              -- цена в ТЫСЯЧАХ ₽
  price_raw       text,
  buy_price_k     numeric,
  tax_system      text,                 -- 'osno' | 'usn6' | 'usn_dr' | 'ausn' | null
  tax_raw         text,
  extra           text,
  has_license     boolean default false,
  banks           text,
  -- служебные
  status          text not null default 'draft',  -- draft | verified | reserved | sold | archived
  source          text not null default 'import', -- import | avito_bot | manual
  needs_review    boolean default false,
  review_notes    text,
  dialog_id       bigint,
  -- официальные данные ЕГРЮЛ (DaData), заполняются проверкой по ИНН
  egrul_status    text,                 -- ACTIVE | LIQUIDATING | LIQUIDATED | REORGANIZING | BANKRUPT
  egrul_name      text,                 -- официальное краткое наименование
  egrul_reg_date  date,                 -- дата регистрации по ЕГРЮЛ
  egrul_address   text,
  egrul_okved     text,
  egrul_data      jsonb,                -- полный ответ для истории
  egrul_checked_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists companies_region_code_idx on companies (region_code);
create index if not exists companies_status_idx on companies (status);
create index if not exists companies_needs_review_idx on companies (needs_review);
create index if not exists companies_inn_idx on companies (inn);

-- журнал импортов (для отката и аудита)
create table if not exists imports (
  id           bigserial primary key,
  filename     text,
  uploaded_by  text,
  stats        jsonb,      -- {inserted, updated, skipped, errors:[...]}
  status       text default 'pending',  -- pending | applied | cancelled
  created_at   timestamptz default now()
);

-- строки импорта до применения (staging для preview/diff)
create table if not exists import_rows (
  id          bigserial primary key,
  import_id   bigint references imports(id) on delete cascade,
  row_num     int,
  raw         jsonb,
  parsed      jsonb,
  match_company_id bigint,
  action      text,        -- insert | update | skip | conflict
  problems    text[]
);
create index if not exists import_rows_import_id_idx on import_rows (import_id);

-- история изменений карточек (кто/когда/что)
create table if not exists company_audit (
  id          bigserial primary key,
  company_id  bigint references companies(id) on delete cascade,
  actor       text,        -- 'admin' | 'bot' | 'import:<id>'
  changes     jsonb,       -- {field: {old, new}}
  created_at  timestamptz default now()
);
create index if not exists company_audit_company_id_idx on company_audit (company_id);

-- зафиксированные выдачи списков клиентам (чтобы найти компанию по номеру позиции)
create table if not exists offers (
  id          bigserial primary key,
  code        text unique not null,      -- короткий код списка, напр. 'K7M'
  filters     jsonb,                     -- фильтры, по которым сформирован список
  company_ids bigint[] not null,         -- состав в порядке позиций 1..N
  note        text,                      -- кому отправлено (чат/имя)
  created_at  timestamptz default now()
);
create index if not exists offers_code_idx on offers (code);

-- пользователи Telegram-бота и их роли
create table if not exists tg_users (
  chat_id     bigint primary key,
  username    text,
  full_name   text,
  role        text not null default 'guest',  -- admin | partner | guest | blocked
  note        text,
  requests    int default 0,
  created_at  timestamptz default now(),
  last_seen   timestamptz default now()
);
create index if not exists tg_users_role_idx on tg_users (role);

-- ===== таблицы бота =====
create table if not exists dialogs (
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

create table if not exists processed_messages (
  avito_message_id text primary key,
  chat_id          text,
  processed_at     timestamptz default now()
);

create table if not exists bot_actions (
  id         bigserial primary key,
  dialog_id  bigint references dialogs(id),
  action     text,
  payload    jsonb,
  created_at timestamptz default now()
);
create index if not exists bot_actions_dialog_id_idx on bot_actions (dialog_id);

create table if not exists leads (
  id         bigserial primary key,
  dialog_id  bigint references dialogs(id),
  kind       text,        -- buyer | seller
  hot        boolean default false,
  processed  boolean default false,
  summary    text,
  company_id bigint references companies(id),
  created_at timestamptz default now()
);

create table if not exists blacklist (
  author_id  bigint primary key,
  reason     text,
  created_at timestamptz default now()
);
