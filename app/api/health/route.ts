import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await sql`select 1`;
    return NextResponse.json({ ok: true, db: 'up' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: 'down', error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
