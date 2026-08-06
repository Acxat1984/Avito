import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { buildUpdateChanges } from '@/lib/import/match';

export const runtime = 'nodejs';

/**
 * Фаза 2 — предпросмотр: постранично строки staging; для update — diff old→new.
 * Параметры: ?page=1&per=50&action=update
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const importId = Number(id);
  if (!Number.isInteger(importId)) {
    return NextResponse.json({ error: 'Неверный id' }, { status: 400 });
  }

  const [imp] = await sql`
    select id, filename, uploaded_by, stats, status, created_at
    from imports where id = ${importId}
  `;
  if (!imp) return NextResponse.json({ error: 'Импорт не найден' }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const per = Math.min(200, Math.max(1, Number(url.searchParams.get('per') ?? 50)));
  const action = url.searchParams.get('action');
  const offset = (page - 1) * per;

  const rows = action
    ? await sql`
        select * from import_rows
        where import_id = ${importId} and action = ${action}
        order by row_num limit ${per} offset ${offset}`
    : await sql`
        select * from import_rows
        where import_id = ${importId}
        order by row_num limit ${per} offset ${offset}`;

  // diff для update-строк
  const updateIds = rows
    .filter((r) => r.action === 'update' && r.match_company_id !== null)
    .map((r) => Number(r.match_company_id));
  const existing = updateIds.length
    ? await sql`select * from companies where id = any(${updateIds})`
    : [];
  const byId = new Map(existing.map((c) => [Number(c.id), c]));

  const out = rows.map((r) => ({
    ...r,
    diff:
      r.action === 'update' && byId.has(Number(r.match_company_id))
        ? buildUpdateChanges(byId.get(Number(r.match_company_id))!, r.parsed as never)
        : null,
  }));

  return NextResponse.json({ import: imp, page, per, rows: out });
}
