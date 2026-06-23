/**
 * Waiz B2B Meta Ads CSV → `acquisition_meta_ad_insights`.
 *
 * Validates a Meta Ads Manager export (ad level, daily breakdown), then replaces
 * rows in the CSV date range and upserts the CSV as the source of truth.
 *
 *   node scripts/import-acquisition-meta-insights-csv.mjs "/path/report.csv" --dry-run
 *   node scripts/import-acquisition-meta-insights-csv.mjs "/path/report.csv"
 *
 * If the export has no Account ID column (common), pass once:
 *   --account-id 123456789012345
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import https from 'https';
import { parseCsv } from './lib/csv.mjs';

const BATCH = 200;
const TABLE = 'acquisition_meta_ad_insights';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

function flagValue(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

const ACCOUNT_ID_OVERRIDE = flagValue('--account-id');
const flagValues = new Set([ACCOUNT_ID_OVERRIDE].filter(Boolean));
const CSV_PATH =
  argv.find((a, i) => !a.startsWith('--') && !flagValues.has(a) && !String(argv[i - 1] ?? '').startsWith('--')) ??
  null;

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

if (!CSV_PATH) {
  fail(
    'Provide a CSV path.\n  node scripts/import-acquisition-meta-insights-csv.mjs "/path/report.csv" --dry-run',
  );
}
if (!existsSync(CSV_PATH)) fail(`CSV not found: ${CSV_PATH}`);

function loadEnv() {
  const fromProcess = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ACQUISITION_META_ACCOUNT_ID: process.env.ACQUISITION_META_ACCOUNT_ID,
  };
  if (!existsSync(envPath)) return fromProcess;
  const fileEnv = readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...val] = line.split('=');
      if (key && val.length) acc[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '');
      return acc;
    }, {});
  return { ...fromProcess, ...fileEnv };
}

const envPath = resolve('.env.local');
const envVars = loadEnv();

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_ACCOUNT_ID = envVars.ACQUISITION_META_ACCOUNT_ID ?? 'waiz_b2b';

function request(method, path, body, extraHeaders = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabaseHost = new URL(SUPABASE_URL).hostname;
  return new Promise((resolvePromise, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: supabaseHost,
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

function buildColumnMap(headers) {
  return {
    day: headerIndex(headers, 'Day', 'Date', 'Reporting starts', 'date_start'),
    accountId: headerIndex(headers, 'Account ID', 'account_id'),
    campaignId: headerIndex(headers, 'Campaign ID', 'campaign_id'),
    campaignName: headerIndex(headers, 'Campaign name', 'Campaign Name'),
    adsetId: headerIndex(headers, 'Ad set ID', 'Ad Set ID', 'adset_id'),
    adsetName: headerIndex(headers, 'Ad set name', 'Ad Set Name', 'adset_name'),
    adId: headerIndex(headers, 'Ad ID', 'ad_id'),
    adName: headerIndex(headers, 'Ad name', 'Ad Name', 'ad_name'),
    spend: headerIndex(headers, 'Amount spent (USD)', 'Amount spent', 'Spend'),
    impressions: headerIndex(headers, 'Impressions'),
    clicks: headerIndex(headers, 'Clicks (all)', 'Link clicks', 'Clicks'),
    cpm: headerIndex(headers, 'CPM (cost per 1,000 impressions)', 'CPM'),
    cpc: headerIndex(headers, 'CPC (cost per link click)', 'CPC (all)', 'CPC'),
    ctr: headerIndex(headers, 'CTR (all)', 'CTR (link click-through rate)', 'CTR'),
  };
}

function parseRows() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const table = parseCsv(raw);
  if (table.length < 2) fail('CSV has no data rows.');

  const headers = table[0].map((h) => h.trim());
  const col = buildColumnMap(headers);

  const accountIdDefault = cleanId(ACCOUNT_ID_OVERRIDE) ?? cleanId(DEFAULT_ACCOUNT_ID);
  const required = [
    ['day', 'Day'],
    ['spend', 'Amount spent (USD)'],
    ['campaignId', 'Campaign ID'],
    ['adsetId', 'Ad set ID'],
    ['adId', 'Ad ID'],
  ];

  const requiredMissing = required.filter(([key]) => col[key] === -1).map(([, label]) => label);
  if (requiredMissing.length) {
    fail(
      `Missing required column(s): ${requiredMissing.join(', ')}.\n` +
        'Use a Meta Ads Reporting export at Ad level with a Day breakdown.',
    );
  }

  if (col.accountId === -1 && !accountIdDefault) {
    fail('No Account ID column in CSV. Pass --account-id <digits> or set ACQUISITION_META_ACCOUNT_ID in .env.local');
  }

  const dedup = new Map();
  let skippedSummary = 0;
  let skippedMissing = 0;
  const dates = new Set();

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const get = (i) => (i >= 0 ? (row[i] ?? '').trim() : '');

    const day = dateOnly(get(col.day));
    const campaignId = cleanId(get(col.campaignId));
    const adsetId = cleanId(get(col.adsetId));
    const adId = cleanId(get(col.adId));
    const accountId = cleanId(get(col.accountId)) ?? accountIdDefault;

    if (!campaignId && !adId) {
      skippedSummary++;
      continue;
    }

    if (!day || !accountId || !campaignId || !adsetId || !adId) {
      skippedMissing++;
      continue;
    }

    dates.add(day);
    const key = `${day}\0${accountId}\0${campaignId}\0${adsetId}\0${adId}`;
    const spend = num(get(col.spend));
    const impressions = Math.trunc(num(get(col.impressions)));
    const clicks = Math.trunc(num(get(col.clicks)));

    if (dedup.has(key)) {
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
        raw: { source: 'import-acquisition-meta-insights-csv' },
      });
    }
  }

  let collapsedKeys = 0;
  for (const row of dedup.values()) {
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
  return {
    rows,
    minDate: sortedDates[0],
    maxDate: sortedDates[sortedDates.length - 1],
    sortedDates,
    skippedSummary,
    skippedMissing,
    collapsedKeys,
    accountIdDefault,
    hasAccountColumn: col.accountId !== -1,
  };
}

async function finish(parsed) {
  const { rows, minDate, maxDate, sortedDates, skippedSummary, skippedMissing, collapsedKeys, accountIdDefault, hasAccountColumn } =
    parsed;
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const uniqueAds = new Set(rows.map((r) => r.ad_id)).size;

  console.log(`\nAcquisition Meta CSV import${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`File:           ${CSV_PATH}`);
  console.log(`Table:          ${TABLE}`);
  console.log(`Date range:     ${minDate} → ${maxDate} (${sortedDates.length} days)`);
  console.log(`Detail rows:    ${rows.length}`);
  console.log(`Unique ads:     ${uniqueAds}`);
  console.log(`Total spend:    $${totalSpend.toFixed(2)}`);
  console.log(
    `Account ID:     ${accountIdDefault}${hasAccountColumn ? '' : ' (default — no Account ID column in CSV)'}`,
  );
  console.log(`Skipped summary row(s): ${skippedSummary}`);
  console.log(`Skipped missing id/date: ${skippedMissing}`);
  if (collapsedKeys > 0) console.log(`Collapsed breakdown keys: ${collapsedKeys}`);

  if (minDate < '2023-05-19' || maxDate > '2026-06-19') {
    console.log('NOTE: Row dates fall outside the filename window — that is OK if the export filter differs.');
  } else if (sortedDates.length < 30) {
    console.log(
      'NOTE: Filename suggests May 2023–Jun 2026 but this file only contains',
      `${sortedDates.length} day(s) of ad-level data. Re-export from Ads Manager with the full date range if history is missing.`,
    );
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN: no changes written.');
    console.log(`Would DELETE ${TABLE} rows in ${minDate}..${maxDate}, then UPSERT ${rows.length} rows.`);
    return;
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local or environment)');
  }

  const now = new Date().toISOString();
  const payloadRows = rows.map((r) => ({ ...r, updated_at: now }));

  const delPath =
    `/rest/v1/${TABLE}?insight_date=gte.${minDate}&insight_date=lte.${maxDate}`;
  const del = await request('DELETE', delPath);
  if (del.status !== 204 && del.status !== 200) {
    throw new Error(`delete existing rows ${del.status}: ${del.data}`);
  }
  console.log(`\nDeleted existing rows in ${minDate}..${maxDate}.`);

  let upserted = 0;
  for (let i = 0; i < payloadRows.length; i += BATCH) {
    const batch = payloadRows.slice(i, i + BATCH);
    const res = await request(
      'POST',
      `/rest/v1/${TABLE}?on_conflict=insight_date,account_id,campaign_id,adset_id,ad_id`,
      batch,
      { Prefer: 'resolution=merge-duplicates,return=minimal' },
    );
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`upsert batch ${res.status}: ${res.data}`);
    }
    upserted += batch.length;
    process.stdout.write(`\r  upserted ${upserted}/${payloadRows.length}...`);
  }
  console.log(`\nUpserted ${upserted} rows.`);

  const verifyPath =
    `/rest/v1/${TABLE}?select=insight_date,spend` +
    `&insight_date=gte.${minDate}&insight_date=lte.${maxDate}` +
    `&order=insight_date.asc`;
  const { status, data } = await request('GET', verifyPath, null, { Prefer: 'return=representation' });
  if (status !== 200) {
    console.log(`(Could not verify totals: ${status})`);
    return;
  }
  const fetched = JSON.parse(data);
  let dbTotal = 0;
  const byDay = new Map();
  for (const r of fetched) {
    const amt = Number(r.spend) || 0;
    byDay.set(r.insight_date, (byDay.get(r.insight_date) ?? 0) + amt);
    dbTotal += amt;
  }
  console.log(`\nDB total for range: $${dbTotal.toFixed(2)}  |  CSV total: $${totalSpend.toFixed(2)}`);
  if (Math.abs(dbTotal - totalSpend) > 0.5) {
    console.log('NOTE: totals differ — check for overlapping imports or skipped rows.');
  } else {
    console.log('Totals match. Import complete.');
  }
}

const parsed = parseRows();
finish(parsed).catch((e) => {
  console.error(e);
  process.exit(1);
});
