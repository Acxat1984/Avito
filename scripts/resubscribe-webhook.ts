/** Перерегистрация вебхука: unsubscribe + subscribe (сброс backoff Avito). */
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
  const url = `https://avito-navy.vercel.app/api/avito/webhook/${config.avito.webhookSecret}`;

  const unsub = await fetch(`${config.avito.baseUrl}/messenger/v1/webhook/unsubscribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  console.log('unsubscribe:', unsub.status, (await unsub.text()).slice(0, 100));

  const sub = await fetch(`${config.avito.baseUrl}/messenger/v3/webhook`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  console.log('subscribe:', sub.status, (await sub.text()).slice(0, 100));

  const list = await fetch(`${config.avito.baseUrl}/messenger/v1/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const body = await list.text();
  console.log('подписки:', body.replace(new RegExp(config.avito.webhookSecret, 'g'), '<SECRET>'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
