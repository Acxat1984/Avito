import { NextRequest, NextResponse } from 'next/server';
import { parseWorkbook } from '@/lib/import/parse';
import { matchRows } from '@/lib/import/match';
import { createImport } from '@/lib/import/apply';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

/** Фаза 1 — Upload & Parse (раздел 5). multipart с .xlsx в поле 'file'. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ожидается файл в поле 'file'" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const parsed = parseWorkbook(buf);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, foundColumns: parsed.foundColumns },
      { status: 422 },
    );
  }

  const matched = await matchRows(parsed.rows);
  const { importId, stats } = await createImport(file.name, 'admin', matched);

  return NextResponse.json({ import_id: importId, stats });
}

/** История импортов. */
export async function GET() {
  const imports = await sql`
    select id, filename, uploaded_by, stats, status, created_at
    from imports order by id desc limit 50
  `;
  return NextResponse.json({ imports });
}
