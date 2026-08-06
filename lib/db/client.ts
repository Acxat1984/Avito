import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { config } from '@/lib/config';

type SqlClient = NeonQueryFunction<false, false>;

let _sql: SqlClient | null = null;

function real(): SqlClient {
  if (!_sql) {
    if (!config.db.url) throw new Error('DATABASE_URL не задан');
    _sql = neon(config.db.url);
  }
  return _sql;
}

/**
 * HTTP-клиент Neon с ленивой инициализацией (модули с чистыми функциями
 * можно импортировать без DATABASE_URL — важно для юнит-тестов).
 * Для транзакций: sql.transaction([...]).
 */
export const sql: SqlClient = new Proxy((() => {}) as unknown as SqlClient, {
  apply: (_t, _this, args) => (real() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const client = real() as unknown as Record<PropertyKey, unknown>;
    const v = client[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(client) : v;
  },
});
