import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { config } from '@/lib/config';
import { processMessage } from '@/lib/dialog/process';
import { WebhookPayload } from '@/lib/avito/types';

export const runtime = 'nodejs';

/**
 * Webhook Avito: валидация секрета в пути, ранний 200 (≤ 2 сек),
 * обработка в фоне через waitUntil.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  if (!config.avito.webhookSecret || secret !== config.avito.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    // невалидный payload → игнор, но 200 (чтобы Avito не ретраил бесконечно)
    return NextResponse.json({ ok: true });
  }

  waitUntil(processMessage(payload));
  return NextResponse.json({ ok: true });
}
