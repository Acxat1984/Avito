import { NextRequest, NextResponse } from 'next/server';

/**
 * Basic Auth на /admin и /api/admin (ADMIN_USER / ADMIN_PASSWORD из env).
 * Webhook Avito и /api/health не защищаются этим прокси.
 */
export function proxy(req: NextRequest) {
  const user = process.env.ADMIN_USER ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';

  // если креды не заданы — закрываем доступ полностью (fail closed)
  if (!user || !password) {
    return new NextResponse('Admin credentials are not configured', { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const [u, p] = atob(auth.slice(6)).split(':');
      if (u === user && p === password) return NextResponse.next();
    } catch {
      // падаем в 401 ниже
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Avito Admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/admin', '/api/admin/:path*'],
};
