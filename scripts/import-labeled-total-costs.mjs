#!/usr/bin/env node
/**
 * Import WM Company Report — Total Costs (labeled) into business_expenses,
 * replace seed rules, and roll up business_metrics.
 *
 *   node scripts/import-labeled-total-costs.mjs              # dry-run
 *   node scripts/import-labeled-total-costs.mjs --apply      # write
 *   node scripts/import-labeled-total-costs.mjs --apply --replace-rules
 *
 * Reads: data/import/expenses/wm-company-total-costs-labeled.csv
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const replaceRules = process.argv.includes('--replace-rules');

function loadEnv() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
      i += c === '\r' ? 2 : 1;
      continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some(cell => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

function toYmd(s) {
  s = (s || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(s) {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(String(s).replace(/[$,\s"]/g, ''));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function mapType(t) {
  const s = (t || '').trim().toLowerCase();
  if (s === 'cac') return 'cac';
  if (s === 'cogs') return 'fulfillment';
  if (s === 'overhead') return 'overhead';
  if (s === 'passthrough') return 'passthrough';
  return null;
}

function normalizeMerchant(raw) {
  return (raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hash(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

// Seed rules — keep in sync with src/lib/expenses.ts SEED_EXPENSE_RULES (subset loaded via dynamic import not available in plain node without tsx)
// For --replace-rules we wipe and insert from a JSON dump generated below.
async function loadSeedRulesFromTs() {
  // Prefer running via the compiled list embedded here by reading the TS file's array is fragile;
  // instead import via tsx if available, else skip rules and only import expenses.
  try {
    const { SEED_EXPENSE_RULES } = await import('../src/lib/expenses.ts');
    return SEED_EXPENSE_RULES;
  } catch {
    return null;
  }
}

const csvPath = path.join(root, 'data/import/expenses/wm-company-total-costs-labeled.csv');
if (!fs.existsSync(csvPath)) {
  console.error('Missing', csvPath);
  process.exit(1);
}

const table = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const headers = table[0].map(h => h.trim());
const idx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
const col = {
  date: idx('Start Date'),
  vendor: idx('Vendor'),
  category: idx('Category'),
  cost: idx('Cost'),
  desc: idx('Description'),
  type: idx('Type'),
  client: idx('Client'),
};

const now = new Date().toISOString();
const rows = [];
const bucketCounts = {};
let skipped = 0;

for (let r = 1; r < table.length; r++) {
  const cells = table[r];
  const get = (i) => (i >= 0 ? (cells[i] ?? '').trim() : '');
  const date = toYmd(get(col.date));
  const amount = parseAmount(get(col.cost));
  const vendor = get(col.vendor);
  const typ = mapType(get(col.type));
  if (!date || !vendor || amount == null || amount === 0 || !typ) {
    skipped++;
    continue;
  }
  const subcategory = (get(col.category) || '').toLowerCase() || null;
  const memo = get(col.desc) || null;
  const exclude = typ === 'passthrough';
  const externalId = hash(['wm-total-costs', date, amount.toFixed(2), normalizeMerchant(vendor), typ, subcategory || '', memo || '']);

  bucketCounts[typ] = (bucketCounts[typ] ?? 0) + 1;
  rows.push({
    occurred_on: date,
    amount,
    currency: 'USD',
    account_id: null,
    source: 'csv_import',
    merchant_raw: vendor,
    merchant_normalized: normalizeMerchant(vendor),
    memo,
    external_id: externalId,
    ceo_bucket: typ,
    subcategory,
    exclude_from_pnl: exclude,
    categorized_by: 'import',
    rule_id: null,
    payroll_run_id: null,
    client_id: null,
    updated_at: now,
  });
}

const months = [...new Set(rows.map(r => r.occurred_on.slice(0, 7)))].sort();

// Collapse exact duplicate lines inside the sheet (same hash) by summing amounts
const byExt = new Map();
for (const r of rows) {
  const prev = byExt.get(r.external_id);
  if (!prev) byExt.set(r.external_id, { ...r });
  else prev.amount = Number(prev.amount) + Number(r.amount);
}
const dedupedRows = [...byExt.values()];
console.log(JSON.stringify({
  dryRun: !apply,
  would_insert: dedupedRows.length,
  collapsed_duplicates: rows.length - dedupedRows.length,
  skipped,
  bucket_counts: bucketCounts,
  months,
  sample: dedupedRows.slice(0, 5).map(r => ({ date: r.occurred_on, vendor: r.merchant_raw, amount: r.amount, bucket: r.ceo_bucket, sub: r.subcategory })),
}, null, 2));

if (!apply) {
  console.log('Dry-run only. Re-run with --apply to write.');
  process.exit(0);
}

// Ensure a default finance account exists
let accountId = null;
{
  const { data: existing } = await sb.from('finance_accounts').select('id').eq('name', 'WM Company Books').maybeSingle();
  if (existing) accountId = existing.id;
  else {
    const { data: created, error } = await sb.from('finance_accounts').insert({
      name: 'WM Company Books',
      institution: 'Labeled spreadsheet',
      account_type: 'other',
      entity: 'Waiz Media',
      is_business: true,
      notes: 'Imported from WM Company Report — Total Costs',
    }).select('id').single();
    if (error) { console.error(error); process.exit(1); }
    accountId = created.id;
  }
}
for (const r of dedupedRows) r.account_id = accountId;

if (replaceRules) {
  const seeds = await loadSeedRulesFromTs();
  if (!seeds) {
    console.warn('Could not load SEED_EXPENSE_RULES via import — skip --replace-rules (run with npx tsx)');
  } else {
    console.log('Replacing expense_category_rules with', seeds.length, 'seed rules…');
    await sb.from('expense_category_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const ruleRows = seeds.map(r => ({
      name: r.name,
      match_type: r.match_type,
      match_value: r.match_value,
      amount_min: r.amount_min,
      amount_max: r.amount_max,
      ceo_bucket: r.ceo_bucket,
      subcategory: r.subcategory,
      exclude_from_pnl: r.exclude_from_pnl,
      priority: r.priority,
      active: r.active !== false,
      notes: r.notes,
      updated_at: now,
    }));
    for (let i = 0; i < ruleRows.length; i += 100) {
      const { error } = await sb.from('expense_category_rules').insert(ruleRows.slice(i, i + 100));
      if (error) { console.error(error); process.exit(1); }
    }
  }
}

// Dedupe against existing external_ids
const { data: existing } = await sb.from('business_expenses').select('external_id').not('external_id', 'is', null);
const seen = new Set((existing ?? []).map(e => e.external_id));
const fresh = dedupedRows.filter(r => !seen.has(r.external_id));
console.log(`Inserting ${fresh.length} (skipped ${dedupedRows.length - fresh.length} existing)…`);

let inserted = 0;
for (let i = 0; i < fresh.length; i += 100) {
  const chunk = fresh.slice(i, i + 100);
  const { error } = await sb.from('business_expenses').insert(chunk);
  if (error) { console.error(error); process.exit(1); }
  inserted += chunk.length;
}
console.log('Inserted', inserted);

// Rollup months into business_metrics
const { data: allExp, error: expErr } = await sb
  .from('business_expenses')
  .select('occurred_on, amount, ceo_bucket, exclude_from_pnl')
  .gte('occurred_on', `${months[0]}-01`)
  .lt('occurred_on', (() => {
    const [y, m] = months[months.length - 1].split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  })());
if (expErr) { console.error(expErr); process.exit(1); }

async function upsertMetric(metricKey, periodDate, value) {
  const { data: found } = await sb.from('business_metrics').select('id')
    .eq('metric_key', metricKey).eq('period_date', periodDate).is('dimension', null).maybeSingle();
  if (found) {
    await sb.from('business_metrics').update({
      value_numeric: value,
      notes: 'Rolled up from business_expenses (WM Total Costs import)',
    }).eq('id', found.id);
  } else {
    await sb.from('business_metrics').insert({
      metric_key: metricKey,
      period_date: periodDate,
      value_numeric: value,
      dimension: null,
      notes: 'Rolled up from business_expenses (WM Total Costs import)',
    });
  }
}

const rollups = [];
for (const month of months) {
  let cac = 0, ful = 0, ovh = 0, n = 0;
  for (const e of allExp ?? []) {
    if (!e.occurred_on?.startsWith(month)) continue;
    if (e.exclude_from_pnl) continue;
    const amt = Math.abs(Number(e.amount) || 0);
    n++;
    if (e.ceo_bucket === 'cac') cac += amt;
    else if (e.ceo_bucket === 'fulfillment') ful += amt;
    else if (e.ceo_bucket === 'overhead') ovh += amt;
  }
  const opex = cac + ful + ovh;
  const pd = `${month}-01`;
  await upsertMetric('marketing_spend', pd, cac);
  await upsertMetric('delivery_costs', pd, ful);
  await upsertMetric('operating_expenses', pd, opex);
  rollups.push({ month, cac, fulfillment: ful, overhead: ovh, opex, n });
}

console.log('Rollups:', JSON.stringify(rollups, null, 2));
console.log('Done.');
