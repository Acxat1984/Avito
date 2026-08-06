import { sql } from '@/lib/db/client';
import { findByInn, EgrulInfo } from './client';

export interface CheckResult {
  ok: boolean;
  found: boolean;
  info?: EgrulInfo;
  /** расхождения с данными продавца */
  mismatches: string[];
  error?: string;
}

/**
 * Проверяет компанию по ИНН в ЕГРЮЛ, сохраняет результат в карточку
 * и пишет расхождения (год, название, статус) в аудит.
 */
export async function checkCompanyByInn(companyId: number): Promise<CheckResult> {
  const [company] = await sql`select * from companies where id = ${companyId}`;
  if (!company) return { ok: false, found: false, mismatches: [], error: 'Компания не найдена' };
  if (!company.inn) {
    return { ok: false, found: false, mismatches: [], error: 'У карточки нет нормализованного ИНН' };
  }

  let info: EgrulInfo | null;
  try {
    info = await findByInn(String(company.inn));
  } catch (e) {
    return { ok: false, found: false, mismatches: [], error: e instanceof Error ? e.message : String(e) };
  }

  if (!info) {
    await sql`
      update companies set
        egrul_status = 'NOT_FOUND', egrul_checked_at = now(), updated_at = now()
      where id = ${companyId}
    `;
    return { ok: true, found: false, mismatches: ['ИНН не найден в ЕГРЮЛ'] };
  }

  // сверка с тем, что указал продавец
  const mismatches: string[] = [];
  if (info.status && info.status !== 'ACTIVE') {
    mismatches.push(`статус в ЕГРЮЛ: ${info.status}`);
  }
  if (info.regDate && company.year_reg) {
    const egrulYear = Number(info.regDate.slice(0, 4));
    if (egrulYear !== Number(company.year_reg)) {
      mismatches.push(`год регистрации: в базе ${company.year_reg}, в ЕГРЮЛ ${egrulYear}`);
    }
  }

  await sql`
    update companies set
      egrul_status = ${info.status},
      egrul_name = ${info.shortName ?? info.name},
      egrul_reg_date = ${info.regDate},
      egrul_address = ${info.address},
      egrul_okved = ${info.okved ? `${info.okved}${info.okvedName ? ` (${info.okvedName})` : ''}` : null},
      egrul_data = ${JSON.stringify(info.raw)}::jsonb,
      egrul_checked_at = now(),
      updated_at = now()
    where id = ${companyId}
  `;

  await sql`
    insert into company_audit (company_id, actor, changes)
    values (${companyId}, 'egrul', ${JSON.stringify({
      egrul_check: {
        old: company.egrul_checked_at ?? null,
        new: `${info.shortName ?? info.name} — ${info.status}${mismatches.length ? `; расхождения: ${mismatches.join('; ')}` : ''}`,
      },
    })}::jsonb)
  `;

  return { ok: true, found: true, info, mismatches };
}
