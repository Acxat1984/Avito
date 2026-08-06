import { sql } from '@/lib/db/client';
import { config } from '@/lib/config';
import { TgUser } from './api';

export type TgRole = 'admin' | 'partner' | 'guest' | 'blocked';

export interface TgUserRow {
  chat_id: number;
  username: string | null;
  full_name: string | null;
  role: TgRole;
  requests: number;
}

/**
 * Находит или заводит пользователя. Админы из TELEGRAM_ADMIN_IDS
 * получают роль admin автоматически при первом обращении.
 */
export async function touchUser(from: TgUser, chatId: number): Promise<TgUserRow> {
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ') || null;
  const isEnvAdmin = config.telegram.adminIds.includes(chatId);

  const [row] = await sql`
    insert into tg_users (chat_id, username, full_name, role, requests, last_seen)
    values (${chatId}, ${from.username ?? null}, ${fullName}, ${isEnvAdmin ? 'admin' : 'guest'}, 1, now())
    on conflict (chat_id) do update set
      username  = excluded.username,
      full_name = excluded.full_name,
      role      = case when ${isEnvAdmin} then 'admin' else tg_users.role end,
      requests  = tg_users.requests + 1,
      last_seen = now()
    returning chat_id, username, full_name, role, requests
  `;
  return {
    chat_id: Number(row.chat_id),
    username: row.username as string | null,
    full_name: row.full_name as string | null,
    role: row.role as TgRole,
    requests: Number(row.requests),
  };
}

export async function setRole(chatId: number, role: TgRole): Promise<void> {
  await sql`
    insert into tg_users (chat_id, role) values (${chatId}, ${role})
    on conflict (chat_id) do update set role = ${role}
  `;
}

export async function listUsers(): Promise<TgUserRow[]> {
  const rows = await sql`
    select chat_id, username, full_name, role, requests from tg_users
    order by case role when 'admin' then 0 when 'partner' then 1 when 'guest' then 2 else 3 end, last_seen desc
    limit 50
  `;
  return rows.map((r) => ({
    chat_id: Number(r.chat_id),
    username: r.username as string | null,
    full_name: r.full_name as string | null,
    role: r.role as TgRole,
    requests: Number(r.requests),
  }));
}
