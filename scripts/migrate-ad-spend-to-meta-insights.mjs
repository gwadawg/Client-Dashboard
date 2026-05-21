/**
 * One-time: copy ad_spend (platform=meta) into meta_ad_insights as synthetic daily totals.
 *
 *   node scripts/migrate-ad-spend-to-meta-insights.mjs --dry-run
 *   node scripts/migrate-ad-spend-to-meta-insights.mjs
 *   node scripts/migrate-ad-spend-to-meta-insights.mjs --delete-meta-ad-spend
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_META = process.argv.includes('--delete-meta-ad-spend');

const SENTINEL = '_imported_daily_total';
const BATCH = 200;

const envPath = resolve('.env.local');
const envVars = readFileSync(envPath, 'utf-8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val.length) acc[key.trim()] = val.join('=').trim();
    return acc;
  }, {});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_HOST = new URL(SUPABASE_URL).hostname;

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolvePromise, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: '104.18.38.10',
        servername: SUPABASE_HOST,
        path,
        method,
        headers: {
          host: SUPABASE_HOST,
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolvePromise({ status: res.statusCode, data }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchAllMetaAdSpend() {
  const rows = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { status, data } = await request(
      'GET',
      `/rest/v1/ad_spend?select=client_id,spend_date,amount&platform=eq.meta&order=spend_date.asc&offset=${offset}&limit=${pageSize}`,
    );
    if (status !== 200) throw new Error(`fetch ad_spend ${status}: ${data}`);
    const batch = JSON.parse(data);
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function toInsightRow(row) {
  return {
    client_id: row.client_id,
    insight_date: row.spend_date,
    account_id: 'legacy',
    campaign_id: SENTINEL,
    campaign_name: 'Imported daily total (Facebook Data)',
    adset_id: SENTINEL,
    adset_name: null,
    ad_id: SENTINEL,
    ad_name: 'Daily total',
    spend: Number(row.amount),
    impressions: 0,
    clicks: 0,
    ctr: null,
    cpc: null,
    cpm: null,
    actions: null,
    cost_per_action_type: null,
    raw: { source: 'migrate-ad-spend-to-meta-insights' },
    updated_at: new Date().toISOString(),
  };
}

async function upsertBatch(batch) {
  if (!batch.length || DRY_RUN) return;
  const { status, data } = await request(
    'POST',
    '/rest/v1/meta_ad_insights?on_conflict=client_id,insight_date,account_id,campaign_id,adset_id,ad_id',
    batch,
    { Prefer: 'resolution=merge-duplicates,return=minimal' },
  );
  if (status !== 201 && status !== 200) throw new Error(`upsert meta_ad_insights ${status}: ${data}`);
}

async function deleteMetaAdSpend() {
  if (DRY_RUN) {
    console.log('DRY RUN: would delete all ad_spend where platform=meta');
    return;
  }
  const { status, data } = await request('DELETE', '/rest/v1/ad_spend?platform=eq.meta');
  if (status !== 204 && status !== 200) throw new Error(`delete ad_spend meta ${status}: ${data}`);
  console.log('Deleted ad_spend rows where platform=meta.');
}

async function main() {
  if (!existsSync(envPath)) throw new Error('Missing .env.local');

  console.log(DRY_RUN ? 'DRY RUN\n' : 'Migrating ad_spend (meta) → meta_ad_insights…\n');

  const metaRows = await fetchAllMetaAdSpend();
  console.log(`Found ${metaRows.length} meta ad_spend rows.`);

  let batch = [];
  let migrated = 0;
  for (const row of metaRows) {
    batch.push(toInsightRow(row));
    if (batch.length >= BATCH) {
      await upsertBatch(batch);
      migrated += batch.length;
      process.stdout.write(`\r  ${migrated}…`);
      batch = [];
    }
  }
  await upsertBatch(batch);
  migrated += batch.length;

  console.log(`\nMigrated: ${migrated} synthetic insight rows.`);

  if (DELETE_META) await deleteMetaAdSpend();
  else console.log('Tip: re-run with --delete-meta-ad-spend after verifying dashboard KPIs.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
