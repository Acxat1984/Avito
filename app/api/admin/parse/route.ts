import { NextRequest, NextResponse } from 'next/server';
import { parseCompaniesFromText } from '@/lib/llm/parse-company';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Разбор вставленного текста в карточки + поиск совпадений в базе. */
export async function POST(req: NextRequest) {
  const { text } = (await req.json()) as { text?: string };
  const result = await parseCompaniesFromText(text ?? '');
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  // ищем дубли по ИНН и по названию
  const inns = result.companies.map((c) => c.normalized.inn).filter((v): v is string => !!v);
  const names = result.companies
    .map((c) => c.normalized.name?.toLowerCase().trim())
    .filter((v): v is string => !!v);
  const existing = inns.length || names.length
    ? await sql`
        select id, name, inn, status from companies
        where (inn = any(${inns}) and inn is not null)
           or lower(trim(name)) = any(${names})
      `
    : [];

  const companies = result.companies.map((c) => {
    const match = existing.find(
      (e) =>
        (c.normalized.inn && e.inn === c.normalized.inn) ||
        (c.normalized.name &&
          String(e.name).toLowerCase().trim() === c.normalized.name.toLowerCase().trim()),
    );
    return {
      ...c,
      match: match ? { id: Number(match.id), name: String(match.name), status: String(match.status) } : null,
    };
  });

  return NextResponse.json({ companies });
}
