'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { CompanyFilters, queryCompaniesAll } from '@/lib/db/queries';

/** Алфавит без похожих символов (0/O, 1/I) — код диктуется голосом и пишется в чат. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len = 3): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

/**
 * Фиксирует состав выдачи: какие компании и в каком порядке отправлены клиенту.
 * Позже по коду и номеру позиции владелец находит конкретную карточку.
 */
export async function saveOffer(
  filters: CompanyFilters,
  note: string | null,
): Promise<{ code: string; count: number }> {
  const companies = await queryCompaniesAll({ ...filters, status: 'verified' });
  const ids = companies.map((c) => Number(c.id));

  // до 10 попыток на случай коллизии кода
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode(attempt < 5 ? 3 : 4);
    const rows = await sql`
      insert into offers (code, filters, company_ids, note)
      values (${code}, ${JSON.stringify(filters)}::jsonb, ${ids}, ${note})
      on conflict (code) do nothing
      returning code
    `;
    if (rows.length > 0) {
      revalidatePath('/admin/offers');
      return { code, count: ids.length };
    }
  }
  throw new Error('Не удалось сгенерировать уникальный код списка');
}
