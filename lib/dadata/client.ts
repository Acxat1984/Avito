import { config } from '@/lib/config';

/**
 * DaData: официальные данные ЕГРЮЛ/ЕГРИП по ИНН.
 * Источник — открытые данные ФНС. В LLM эти данные не передаются.
 */

export type EgrulStatus = 'ACTIVE' | 'LIQUIDATING' | 'LIQUIDATED' | 'REORGANIZING' | 'BANKRUPT';

export interface EgrulInfo {
  inn: string;
  ogrn: string | null;
  /** полное значение из DaData: ООО «Ромашка» */
  name: string;
  shortName: string | null;
  status: EgrulStatus | null;
  /** дата регистрации ISO yyyy-mm-dd */
  regDate: string | null;
  /** дата ликвидации, если есть */
  liquidationDate: string | null;
  address: string | null;
  okved: string | null;
  okvedName: string | null;
  management: string | null;
  type: 'LEGAL' | 'INDIVIDUAL' | null;
  raw: unknown;
}

export const STATUS_RU: Record<string, string> = {
  ACTIVE: 'действующая',
  LIQUIDATING: 'в процессе ликвидации',
  LIQUIDATED: 'ликвидирована',
  REORGANIZING: 'в процессе реорганизации',
  BANKRUPT: 'банкротство',
};

function toIso(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Поиск организации по ИНН. null — если не найдена. */
export async function findByInn(inn: string): Promise<EgrulInfo | null> {
  if (!config.dadata.apiKey) throw new Error('DADATA_API_KEY не задан');

  const res = await fetch(
    'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.dadata.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: inn, count: 1 }),
    },
  );
  if (!res.ok) {
    throw new Error(`DaData ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    suggestions?: Array<{ value: string; data: Record<string, never> }>;
  };
  const s = data.suggestions?.[0];
  if (!s) return null;

  const d = s.data as Record<string, never>;
  const state = (d.state ?? {}) as Record<string, never>;
  const name = (d.name ?? {}) as Record<string, never>;
  const address = (d.address ?? {}) as Record<string, never>;
  const management = (d.management ?? {}) as Record<string, never>;

  return {
    inn: String(d.inn ?? inn),
    ogrn: d.ogrn ? String(d.ogrn) : null,
    name: s.value,
    shortName: name.short_with_opf ? String(name.short_with_opf) : null,
    status: (state.status as EgrulStatus | undefined) ?? null,
    regDate: toIso(state.registration_date as number | undefined),
    liquidationDate: toIso(state.liquidation_date as number | undefined),
    address: address.value ? String(address.value) : null,
    okved: d.okved ? String(d.okved) : null,
    okvedName: d.okved_type ? String(d.okved_type) : null,
    management: management.name ? String(management.name) : null,
    type: (d.type as 'LEGAL' | 'INDIVIDUAL' | undefined) ?? null,
    raw: s,
  };
}
