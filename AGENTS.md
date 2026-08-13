# Avito Assistant + Admin

**Прежде чем менять код, прочитай `DOCS.md`** — полная документация проекта: архитектура,
модель данных, логика обоих ботов и админки, инварианты, известные подводные камни.
Техзадание заказчика — `SPEC_v2.md`.

Коротко: одно Next.js-приложение на Vercel + Neon. Три поверхности — Telegram-бот для
владельца (`lib/telegram/bot.ts`), автоответчик Avito (`lib/dialog/process.ts`) и админка
(`app/admin/*`), все работают с одной базой.

Жёсткие правила: клиенту уходят только шаблоны из кода (INV-2), ИНН и контакты продавца
не раскрываются (INV-4), автоматика создаёт карточки только в статусе `draft`.
Тесты — `npm test` (131 штука, сеть не нужна).

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
