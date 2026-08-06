import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { config } from '@/lib/config';
import { handleUpdate } from '@/lib/telegram/bot';
import { TgUpdate } from '@/lib/telegram/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Вебхук Telegram: проверка секретного заголовка, ранний 200,
 * обработка в фоне (LLM-разбор может занять секунды).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!config.telegram.webhookSecret || secret !== config.telegram.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  waitUntil(
    handleUpdate(update).catch((e) => {
      console.error('[tg] handleUpdate failed:', e);
    }),
  );
  return NextResponse.json({ ok: true });
}
