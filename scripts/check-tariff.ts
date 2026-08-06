/** Что API говорит о подписке/тарифе и балансе аккаунта. */
import { config } from '../lib/config';

async function token(): Promise<string> {
  const r = await fetch(`${config.avito.baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.avito.clientId,
      client_secret: config.avito.clientSecret,
    }),
  });
  return (await r.json()).access_token;
}

async function main() {
  const t = await token();
  const endpoints: Array<[string, string]> = [
    ['GET', '/core/v1/accounts/self'],
    ['GET', `/core/v1/accounts/${config.avito.userId}/balance/`],
    ['GET', '/cpa/v3/balanceInfo'],
    ['GET', '/tariff/info/v1'],
    ['GET', '/tariff/info/v2'],
  ];
  for (const [method, path] of endpoints) {
    try {
      const res = await fetch(`${config.avito.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      const body = (await res.text()).slice(0, 300);
      console.log(`${res.status} ${path}\n    ${body}\n`);
    } catch (e) {
      console.log(`ERR ${path}: ${(e as Error).message}\n`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
