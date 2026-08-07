/**
 * Типы сводки массовой проверки ЕГРЮЛ.
 * Вынесены из actions.ts: из файла с 'use server' можно экспортировать
 * только асинхронные функции.
 */

export interface EgrulSweepCompany {
  id: number;
  name: string;
  status: string;
  statusRu: string;
}

export interface EgrulSweepResult {
  checked: number;
  active: number;
  /** компании, у которых статус в ЕГРЮЛ изменился с прошлой проверки */
  changed: EgrulSweepCompany[];
  /** ликвидированные, банкроты и всё, что не ACTIVE — их предлагаем убрать */
  problem: EgrulSweepCompany[];
  notFound: EgrulSweepCompany[];
  errors: string[];
  /** сколько карточек осталось непроверенными из-за лимита прогона */
  remaining: number;
}
