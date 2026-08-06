/** Отправка согласованного запроса в один чат (Ск прогресс, подтверждено владельцем). */
import { neon } from '@neondatabase/serverless';
import { sendMessage } from '../lib/avito/client';

const sql = neon(process.env.DATABASE_URL!);

const CHAT_ID = 'u2i-T_jLWoKS4XF3inXJGFPfyQ';
const COMPANY_INN = '1650358500'; // Ск прогресс
const TEXT =
  'Здравствуйте! Актуальна ли продажа фирмы? Уточните цену продажи. Напишите ваш номер телефона.';

async function main() {
  const [company] = await sql`select id, name, dialog_id from companies where inn = ${COMPANY_INN}`;
  if (!company) throw new Error('Компания не найдена в БД');
  if (company.dialog_id) {
    console.log(`Уже отправляли (dialog_id=${company.dialog_id}) — пропуск`);
    return;
  }

  await sendMessage(CHAT_ID, TEXT);
  console.log(`Сообщение отправлено в чат ${CHAT_ID}`);

  const [dlg] = await sql`
    insert into dialogs (avito_chat_id, client_author_id, intent, status, bot_messages_sent)
    values (${CHAT_ID}, 0, 'sell', 'closed', 1)
    on conflict (avito_chat_id) do update set status = 'closed', updated_at = now()
    returning id
  `;
  await sql`
    insert into bot_actions (dialog_id, action, payload)
    values (${dlg.id}, 'outreach_sent', ${JSON.stringify({ company_id: Number(company.id), inn: COMPANY_INN, text: TEXT })}::jsonb)
  `;
  await sql`
    update companies set dialog_id = ${dlg.id},
      review_notes = review_notes || '; запрос отправлен в Avito', updated_at = now()
    where id = ${company.id}
  `;
  console.log(`Диалог #${dlg.id} создан со статусом closed (бот на ответ реагировать не будет), карточка «${company.name}» обновлена`);
}

main().catch((e) => {
  console.error('ОШИБКА:', e instanceof Error ? e.message : e);
  process.exit(1);
});
