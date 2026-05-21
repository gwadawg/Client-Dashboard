/**
 * Build or send one `/api/ad-spend` test payload.
 *
 * Dry run:
 *   node scripts/test-ad-spend-webhook.mjs --client "Client Name" --amount 12.34
 *
 * Send:
 *   node scripts/test-ad-spend-webhook.mjs --client "Client Name" --amount 12.34 --url https://app.example.com --send
 */

import { existsSync, readFileSync } from 'fs';

function loadEnv() {
  if (!existsSync('.env.local')) return {};

  return readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) acc[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
      return acc;
    }, {});
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function yesterdayIsoDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const env = loadEnv();
  const clientName = argValue('--client');
  const date = argValue('--date', yesterdayIsoDate());
  const amount = Number(argValue('--amount', '1'));
  const appUrl = argValue('--url', env.APP_URL || env.NEXT_PUBLIC_APP_URL || '');
  const secret = argValue('--secret', env.ADMIN_WEBHOOK_SECRET || '');
  const shouldSend = process.argv.includes('--send');

  if (!clientName) throw new Error('Missing --client "Exact Dashboard Client Name".');
  if (!Number.isFinite(amount)) throw new Error('Missing or invalid --amount.');

  const payload = {
    client_name: clientName,
    date,
    platform: 'meta',
    amount,
  };

  if (!shouldSend) {
    console.log('Dry run. Add --send to post this payload.\n');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!appUrl) throw new Error('Missing --url https://YOUR_RAILWAY_APP_URL or APP_URL in .env.local.');
  if (!secret) throw new Error('Missing --secret or ADMIN_WEBHOOK_SECRET in .env.local.');

  const response = await fetch(`${appUrl.replace(/\/$/, '')}/api/ad-spend`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  console.log(`Status: ${response.status}`);
  console.log(body);

  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
