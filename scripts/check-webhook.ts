/** Проверка подписок вебхука Avito: POST /messenger/v1/subscriptions */
import { config } from '../lib/config';

async function main() {
  const tokenRes = await fetch(`${config.avito.baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.avito.clientId,
      client_secret: config.avito.clientSecret,
    }),
  });
  const { access_token } = await tokenRes.json();
  const res = await fetch(`${config.avito.baseUrl}/messenger/v1/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}` },
  });
  console.log('HTTP', res.status);
  const body = await res.text();
  // маскируем секрет вебхука в выводе
  console.log(body.replace(new RegExp(config.avito.webhookSecret, 'g'), '<SECRET>'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
