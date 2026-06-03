/**
 * Per-client Meta Ads CSV importer for `meta_ad_insights`.
 *
 * Validates one client's Meta Ads "Reporting" export, then replaces that
 * client's rows within the CSV's date range with the CSV as the true source.
 * Rows outside the CSV's date range are left untouched.
 *
 *   # validate only (no writes)
 *   node scripts/import-meta-insights-csv.mjs "/path/Client.csv" --client "Exact Dashboard Name" --dry-run
 *
 *   # real import (delete date range for client, then insert)
 *   node scripts/import-meta-insights-csv.mjs "/path/Client.csv" --client "Exact Dashboard Name"
 *
 *   # file missing the Account ID column? supply it once (constant per client):
 *   node scripts/import-meta-insights-csv.mjs "/path/Client.csv" --client "Name" --account-id 123456789
 *
 * If a file has a demographic breakdown (e.g. Age), rows for the same ad/day are
 * summed (spend/impressions/clicks) and CPC/CPM/CTR are recomputed from the sums.
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import https from 'https';
import { parseCsv } from './lib/csv.mjs';

const BATCH = 200;

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

function flagValue(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

const CLIENT_NAME = flagValue('--client');
const ACCOUNT_ID_OVERRIDE = flagValue('--account-id');

// Positional CSV path = first non-flag arg that isn't a value consumed by a flag.
const flagValues = new Set([CLIENT_NAME, ACCOUNT_ID_OVERRIDE].filter(Boolean));
const CSV_PATH =
  argv.find((a, i) => !a.startsWith('--') && !flagValues.has(a) && !String(argv[i - 1] ?? '').startsWith('--')) ??
  argv.find((a) => !a.startsWith('--') && !flagValues.has(a)) ??
  null;

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

if (!CSV_PATH) fail('Provide a CSV path. Example:\n  node scripts/import-meta-insights-csv.mjs "/path/Client.csv" --client "Exact Dashboard Name" --dry-run');
if (!CLIENT_NAME) fail('Provide --client "Exact Dashboard Name".');
if (!existsSync(CSV_PATH)) fail(`CSV not found: ${CSV_PATH}`);

// ── Env / Supabase REST ──────────────────────────────────────────────────────
const envPath = resolve('.env.local');
if (!existsSync(envPath)) fail('Missing .env.local');

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
if (!SUPABASE_URL || !SERVICE_KEY) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function headerIndex(headers, ...candidates) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function cleanId(value) {
  if (value == null) return null;
  // Strip Meta export prefixes like cg:, c:, a:, act_
  const text = String(value).trim().replace(/^(cg:|c:|a:|act_)/, '');
  return text || null;
}

function num(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value) {
  if (!value) return null;
  const d = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

async function resolveClientId(name) {
  const { status, data } = await request(
    'GET',
    `/rest/v1/clients?select=id,name&name=eq.${encodeURIComponent(name)}`,
    null,
    { Prefer: 'return=representation' },
  );
  if (status !== 200) throw new Error(`lookup client ${status}: ${data}`);
  const rows = JSON.parse(data);
  if (!rows.length) return null;
  return rows[0].id;
}

// ── Parse + validate ─────────────────────────────────────────────────────────
function buildColumnMap(headers) {
  return {
    day: headerIndex(headers, 'Day', 'Date', 'Reporting starts', 'date_start'),
    accountId: headerIndex(headers, 'Account ID', 'account_id'),
    accountName: headerIndex(headers, 'Account name', 'Account Name'),
    campaignId: headerIndex(headers, 'Campaign ID', 'campaign_id'),
    campaignName: headerIndex(headers, 'Campaign name', 'Campaign Name'),
    adsetId: headerIndex(headers, 'Ad set ID', 'Ad Set ID', 'adset_id'),
    adsetName: headerIndex(headers, 'Ad set name', 'Ad Set Name', 'adset_name'),
    adId: headerIndex(headers, 'Ad ID', 'ad_id'),
    adName: headerIndex(headers, 'Ad name', 'Ad Name', 'ad_name'),
    spend: headerIndex(headers, 'Amount spent (USD)', 'Amount spent', 'Spend'),
    impressions: headerIndex(headers, 'Impressions'),
    clicks: headerIndex(headers, 'Link clicks', 'Clicks'),
    cpm: headerIndex(headers, 'CPM (cost per 1,000 impressions)', 'CPM'),
    cpc: headerIndex(headers, 'CPC (cost per link click)', 'CPC'),
    ctr: headerIndex(headers, 'CTR (link click-through rate)', 'CTR (all)', 'CTR'),
  };
}

function main() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const table = parseCsv(raw);
  if (table.length < 2) fail('CSV has no data rows.');

  const headers = table[0].map((h) => h.trim());
  const col = buildColumnMap(headers);

  // Required columns. Account ID may be absent if --account-id is supplied.
  const required = [
    ['day', 'Day'],
    ['spend', 'Amount spent (USD)'],
    ['campaignId', 'Campaign ID'],
    ['adsetId', 'Ad set ID'],
    ['adId', 'Ad ID'],
  ];
  if (!ACCOUNT_ID_OVERRIDE) required.push(['accountId', 'Account ID']);

  const requiredMissing = required.filter(([key]) => col[key] === -1).map(([, label]) => label);
  if (requiredMissing.length) {
    const accountHint =
      !ACCOUNT_ID_OVERRIDE && col.accountId === -1
        ? '\nNo Account ID column found. Either re-export with it, or pass --account-id <id> for this client.'
        : '';
    fail(
      `Missing required column(s): ${requiredMissing.join(', ')}.\n` +
        'This looks like the wrong Meta export. Use Ads Reporting at Ad level, broken down by Day, ' +
        'with Campaign/Ad set/Ad IDs and Amount spent columns.' +
        accountHint,
    );
  }

  const optionalMissing = [];
  for (const [key, label] of [
    ['impressions', 'Impressions'],
    ['clicks', 'Link clicks'],
    ['cpm', 'CPM'],
    ['cpc', 'CPC'],
    ['ctr', 'CTR'],
  ]) {
    if (col[key] === -1) optionalMissing.push(label);
  }

  // Build rows + collect issues
  const dedup = new Map();
  const accountIds = new Set();
  const accountNames = new Set();
  let skippedSummary = 0;
  let skippedMissing = 0;
  const dates = new Set();

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const get = (i) => (i >= 0 ? (row[i] ?? '').trim() : '');

    const accountName = get(col.accountName);
    const day = dateOnly(get(col.day));
    const accountId = cleanId(get(col.accountId)) ?? (ACCOUNT_ID_OVERRIDE ? cleanId(ACCOUNT_ID_OVERRIDE) : null);
    const campaignId = cleanId(get(col.campaignId));
    const adsetId = cleanId(get(col.adsetId));
    const adId = cleanId(get(col.adId));

    // Skip the leading account-total row (blank account name + blank ids)
    if (!accountName && !campaignId && !adId) {
      skippedSummary++;
      continue;
    }

    if (!day || !accountId || !campaignId || !adsetId || !adId) {
      skippedMissing++;
      continue;
    }

    if (accountId) accountIds.add(accountId);
    if (accountName) accountNames.add(accountName);
    dates.add(day);

    const key = `${day}\0${accountId}\0${campaignId}\0${adsetId}\0${adId}`;
    const spend = num(get(col.spend));
    const impressions = Math.trunc(num(get(col.impressions)));
    const clicks = Math.trunc(num(get(col.clicks)));

    if (dedup.has(key)) {
      // Same ad/day appears more than once (e.g. an Age breakdown) -> sum additive metrics.
      const existing = dedup.get(key);
      existing.spend += spend;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing._merged += 1;
    } else {
      dedup.set(key, {
        insight_date: day,
        account_id: accountId,
        campaign_id: campaignId,
        campaign_name: get(col.campaignName) || null,
        adset_id: adsetId,
        adset_name: get(col.adsetName) || null,
        ad_id: adId,
        ad_name: get(col.adName) || null,
        spend,
        impressions,
        clicks,
        ctr: nullableNum(get(col.ctr)),
        cpc: nullableNum(get(col.cpc)),
        cpm: nullableNum(get(col.cpm)),
        _merged: 1,
        raw: { source: 'import-meta-insights-csv', account_name: accountName || null },
      });
    }
  }

  let collapsedKeys = 0;
  for (const row of dedup.values()) {
    // If breakdown rows were merged, the per-row rates no longer apply -> recompute from sums.
    if (row._merged > 1) {
      collapsedKeys++;
      row.cpc = row.clicks > 0 ? Number((row.spend / row.clicks).toFixed(6)) : null;
      row.cpm = row.impressions > 0 ? Number(((row.spend / row.impressions) * 1000).toFixed(6)) : null;
      row.ctr = row.impressions > 0 ? Number(((row.clicks / row.impressions) * 100).toFixed(6)) : null;
    }
    delete row._merged;
  }

  const rows = [...dedup.values()];
  if (!rows.length) fail('No valid ad/day rows found after parsing.');

  const sortedDates = [...dates].sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const uniqueAds = new Set(rows.map((r) => r.ad_id)).size;

  // ── Print summary ──────────────────────────────────────────────────────────
  console.log(`\nMeta CSV import${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`File:           ${CSV_PATH}`);
  console.log(`Client (arg):   ${CLIENT_NAME}`);
  console.log(`Date range:     ${minDate} -> ${maxDate} (${sortedDates.length} days)`);
  console.log(`Detail rows:    ${rows.length} (after dedupe)`);
  console.log(`Unique ads:     ${uniqueAds}`);
  console.log(`Total spend:    $${totalSpend.toFixed(2)}`);
  console.log(`Account ID(s):  ${[...accountIds].join(', ') || '(none)'}${ACCOUNT_ID_OVERRIDE && col.accountId === -1 ? ' (from --account-id)' : ''}`);
  console.log(`Account name(s):${' '}${[...accountNames].join(' | ') || '(none)'}`);
  console.log(`Skipped (summary row): ${skippedSummary}`);
  console.log(`Skipped (missing id/date): ${skippedMissing}`);
  if (collapsedKeys > 0) console.log(`Breakdown rows collapsed: ${collapsedKeys} ad/day key(s) summed; CPC/CPM/CTR recomputed`);
  if (optionalMissing.length) console.log(`Optional columns missing: ${optionalMissing.join(', ')} (stored as 0/null)`);

  const issues = [];
  if (accountIds.size > 1) {
    issues.push(`Multiple Account IDs in one file (${accountIds.size}). This should be a single client's export.`);
  }
  if (skippedMissing > 0) {
    issues.push(`${skippedMissing} row(s) missing date or IDs were skipped.`);
  }
  if (issues.length) {
    console.log('\nWARNINGS:');
    for (const i of issues) console.log(`  - ${i}`);
  }

  // Continue async (client resolve + writes)
  return finish(rows, minDate, maxDate, totalSpend, issues);
}

async function finish(rows, minDate, maxDate, totalSpend, issues) {
  const clientId = await resolveClientId(CLIENT_NAME);
  if (!clientId) {
    fail(`Client "${CLIENT_NAME}" not found in clients table. Use the exact dashboard roster name.`);
  }
  console.log(`\nResolved client_id: ${clientId}`);

  if (DRY_RUN) {
    console.log('\nDRY RUN: no changes written.');
    console.log(`Would DELETE meta_ad_insights for client within ${minDate}..${maxDate}, then INSERT ${rows.length} rows.`);
    if (issues.length) console.log('Resolve the warnings above (if any) before a real import.');
    return;
  }

  // Stamp client_id + updated_at on every row
  const now = new Date().toISOString();
  const payloadRows = rows.map((r) => ({ ...r, client_id: clientId, updated_at: now }));

  // 1. Delete the client's existing rows within the CSV date range
  const delPath =
    `/rest/v1/meta_ad_insights?client_id=eq.${clientId}` +
    `&insight_date=gte.${minDate}&insight_date=lte.${maxDate}`;
  const del = await request('DELETE', delPath);
  if (del.status !== 204 && del.status !== 200) {
    throw new Error(`delete existing rows ${del.status}: ${del.data}`);
  }
  console.log(`Deleted existing rows for ${CLIENT_NAME} in ${minDate}..${maxDate}.`);

  // 2. Insert CSV rows in batches
  let inserted = 0;
  for (let i = 0; i < payloadRows.length; i += BATCH) {
    const batch = payloadRows.slice(i, i + BATCH);
    const ins = await request('POST', '/rest/v1/meta_ad_insights', batch, {
      Prefer: 'return=minimal',
    });
    if (ins.status !== 201 && ins.status !== 200) {
      throw new Error(`insert batch ${ins.status}: ${ins.data}`);
    }
    inserted += batch.length;
    process.stdout.write(`\r  inserted ${inserted}/${payloadRows.length}...`);
  }
  console.log(`\nInserted ${inserted} rows.`);

  // 3. Verify: print per-day spend totals from DB for this client/range
  await printDailyTotals(clientId, minDate, maxDate, totalSpend);
}

async function printDailyTotals(clientId, minDate, maxDate, csvTotal) {
  const path =
    `/rest/v1/meta_ad_insights?select=insight_date,spend` +
    `&client_id=eq.${clientId}&insight_date=gte.${minDate}&insight_date=lte.${maxDate}` +
    `&order=insight_date.asc`;
  const { status, data } = await request('GET', path, null, { Prefer: 'return=representation' });
  if (status !== 200) {
    console.log(`(Could not read back daily totals: ${status})`);
    return;
  }
  const fetched = JSON.parse(data);
  const byDay = new Map();
  let dbTotal = 0;
  for (const r of fetched) {
    const amt = Number(r.spend) || 0;
    byDay.set(r.insight_date, (byDay.get(r.insight_date) ?? 0) + amt);
    dbTotal += amt;
  }
  const days = [...byDay.keys()].sort();
  const preview = days.slice(0, 10);
  console.log('\nDaily spend in DB (first 10 days):');
  for (const d of preview) console.log(`  ${d}  $${byDay.get(d).toFixed(2)}`);
  if (days.length > 10) console.log(`  ... (${days.length} days total)`);
  console.log(`\nDB total for range: $${dbTotal.toFixed(2)}  |  CSV total: $${csvTotal.toFixed(2)}`);
  const diff = Math.abs(dbTotal - csvTotal);
  if (diff > 0.5) {
    console.log(`NOTE: totals differ by $${diff.toFixed(2)} - check for overlapping accounts or skipped rows.`);
  } else {
    console.log('Totals match. Import looks good.');
  }
}

main();
