import { STATUS_RU } from '@/lib/dadata/client';

/** Статус компании в ЕГРЮЛ (данные DaData). */
export function EgrulBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    LIQUIDATING: 'bg-orange-100 text-orange-800',
    LIQUIDATED: 'bg-red-100 text-red-800',
    REORGANIZING: 'bg-yellow-100 text-yellow-800',
    BANKRUPT: 'bg-red-100 text-red-800',
    NOT_FOUND: 'bg-gray-200 text-gray-700',
  };
  const label = status === 'NOT_FOUND' ? 'нет в ЕГРЮЛ' : STATUS_RU[status] ?? status;
  return <span className={`rounded px-2 py-0.5 text-xs ${colors[status] ?? 'bg-gray-100'}`}>{label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-200 text-gray-700',
    verified: 'bg-green-100 text-green-800',
    reserved: 'bg-yellow-100 text-yellow-800',
    sold: 'bg-blue-100 text-blue-800',
    archived: 'bg-gray-100 text-gray-400',
    // статусы диалогов/импортов
    new: 'bg-gray-200 text-gray-700',
    awaiting_reply: 'bg-yellow-100 text-yellow-800',
    escalated: 'bg-red-100 text-red-800',
    rejected: 'bg-gray-100 text-gray-500',
    closed: 'bg-gray-100 text-gray-500',
    pending: 'bg-yellow-100 text-yellow-800',
    applied: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${colors[status] ?? 'bg-gray-100'}`}>{status}</span>
  );
}
