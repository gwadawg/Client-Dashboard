/**
 * Backfill ad/UTM attribution columns on existing `events` rows.
 *
 * Imported leads (see scripts/transform-leads-csv.mjs) carry the ad name inside
 * `raw.ad_name` / `raw.ad_set_name`; live leads may carry `raw.utm_*`. This copies
 * those into the new top-level columns (ad_name, adset_name, campaign_name,
 * utm_source, utm_campaign, utm_content) so the Media Buyer view can group by
 * ad_name without reaching into raw.
 *
 * Only rows where ad_name is currently NULL are touched, so it is safe to re-run.
 *
 *   node scripts/backfill-ad-attribution.mjs --dry-run
 *   node scripts/backfill-ad-attribution.mjs
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE = 1000;
const CONCURRENCY = 10;

const envPath = resolve('.env.local');
if (!existsSync(envPath)) {
  console.error('Missing .env.local');
  process.exit(1);
}

const envVars = readFileSync(envPath, 'utf-8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val.length) acc[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '');
    return acc;
  }, {});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const SUPABASE_HOST = new URL(SUPABASE_URL).hostname;

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolvePromise, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: SUPABASE_HOST,
        path,
        method,
        headers: {
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

function pick(raw, ...keys) {
  if (!raw || typeof raw !== 'object') return null;
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function buildUpdate(raw) {
  const ad_name = pick(raw, 'ad_name', 'adName', 'utm_content');
  const adset_name = pick(raw, 'adset_name', 'ad_set_name', 'adSetName');
  const campaign_name = pick(raw, 'campaign_name', 'campaignName', 'utm_campaign');
  const utm_source = pick(raw, 'utm_source');
  const utm_campaign = pick(raw, 'utm_campaign');
  const utm_content = pick(raw, 'utm_content');

  const update = {};
  if (ad_name) update.ad_name = ad_name;
  if (adset_name) update.adset_name = adset_name;
  if (campaign_name) update.campaign_name = campaign_name;
  if (utm_source) update.utm_source = utm_source;
  if (utm_campaign) update.utm_campaign = utm_campaign;
  if (utm_content) update.utm_content = utm_content;
  return Object.keys(update).length ? update : null;
}

async function fetchPage(offset) {
  // Paginate over ALL raw-bearing rows ordered by id (stable: neither `raw` nor
  // `id` is mutated, so offsets don't shift as we write ad_name). Already-set
  // rows are skipped in code, which keeps re-runs idempotent.
  const path =
    `/rest/v1/events?select=id,raw,ad_name&raw=not.is.null` +
    `&order=id.asc&offset=${offset}&limit=${PAGE}`;
  const { status, data } = await request('GET', path, null, { Prefer: 'return=representation' });
  if (status !== 200) throw new Error(`fetch events ${status}: ${data}`);
  return JSON.parse(data);
}

async function patchRow(id, update) {
  const { status, data } = await request(
    'PATCH',
    `/rest/v1/events?id=eq.${id}`,
    update,
  );
  if (status !== 204 && status !== 200) throw new Error(`patch ${id} ${status}: ${data}`);
}

async function runPool(items, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log(`Backfill ad attribution${DRY_RUN ? ' (DRY RUN)' : ''}`);
  let offset = 0;
  let scanned = 0;
  let updatable = 0;
  let written = 0;

  while (true) {
    const rows = await fetchPage(offset);
    if (!rows.length) break;
    scanned += rows.length;

    const toUpdate = [];
    for (const row of rows) {
      // Skip rows that already carry an ad name (idempotent re-runs).
      if (typeof row.ad_name === 'string' && row.ad_name.trim()) continue;
      const update = buildUpdate(row.raw);
      if (update) toUpdate.push({ id: row.id, update });
    }
    updatable += toUpdate.length;

    if (!DRY_RUN && toUpdate.length) {
      await runPool(toUpdate, async ({ id, update }) => {
        await patchRow(id, update);
        written++;
        if (written % 250 === 0) process.stdout.write(`\r  updated ${written}...`);
      });
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`\nScanned: ${scanned}`);
  console.log(`With ad/UTM data in raw: ${updatable}`);
  if (DRY_RUN) {
    console.log('DRY RUN: no rows written.');
  } else {
    console.log(`Updated: ${written}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
