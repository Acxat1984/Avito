import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/admin', label: 'Дашборд' },
  { href: '/admin/companies', label: 'Компании' },
  { href: '/admin/paste', label: 'Из сообщения' },
  { href: '/admin/imports', label: 'Импорт' },
  { href: '/admin/offers', label: 'Выдачи' },
  { href: '/admin/leads', label: 'Лиды' },
  { href: '/admin/dialogs', label: 'Диалоги' },
  { href: '/admin/help', label: 'Инструкция' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <span className="font-semibold">Avito Admin</span>
          <nav className="flex gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-gray-600 hover:text-gray-900">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
