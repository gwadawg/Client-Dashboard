#!/usr/bin/env node
/**
 * Backfill payroll / commissions / bonus / contractor rows from the labeled
 * Total Costs sheet into business_expenses as source=payroll.
 *
 * Links matched roster agents via payroll_run_id = sheet:{date}:{agentId}
 * Unmatched people still import with payroll_run_id = sheet:{date}:name:{slug}
 *
 * Does NOT import software/ad-spend rows. Chase Wise ACH stays separate
 * (usually Pending) — keep those exclude_from_pnl when mapping so OpEx
 * isn't double-counted with these labeled payroll lines.
 *
 *   npx tsx scripts/import-sheet-payroll.mjs           # dry-run
 *   npx tsx scripts/import-sheet-payroll.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const csvPath = path.join(root, 'data/import/expenses/wm-company-total-costs-labeled.csv');

const PAYROLL_CATEGORIES = new Set([
  'payroll',
  'comissions', // sheet spelling
  'commissions',
  'bonus',
  'contractor',
]);

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
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}

function mapType(t) {
  const s = (t || '').trim().toLowerCase();
  if (s === 'cogs') return 'fulfillment';
  if (s === 'cac') return 'cac';
  if (s === 'overhead') return 'overhead';
  if (s === 'passthrough' || s === 'pass-through') return 'passthrough';
  return 'fulfillment';
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Match sheet vendor → agents.id (first/last token heuristics). */
function matchAgent(vendor, agents) {
  const v = normName(vendor);
  if (!v) return null;
  // Exact / contains full name
  for (const a of agents) {
    const n = normName(a.name);
    if (n === v || n.includes(v) || v.includes(n)) return a;
  }
  // First token unique match (Laura → Laura Moço)
  const first = v.split(' ')[0];
  if (first.length < 3) return null;
  const hits = agents.filter(a => {
    const parts = normName(a.name).split(' ');
    return parts[0] === first || parts.includes(first);
  });
  if (hits.length === 1) return hits[0];
  return null;
}

async function ensureAccount() {
  const name = 'WM Payroll (sheet)';
  const { data: existing } = await sb.from('finance_accounts').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  if (!apply) {
    console.log('[dry-run] would create finance_accounts:', name);
    return null;
  }
  const { data, error } = await sb.from('finance_accounts').insert({
    name,
    institution: 'Waiz Media books',
    account_type: 'other',
    entity: 'Waiz Media',
    is_business: true,
    active: true,
    notes: 'Labeled payroll/commissions from Total Costs sheet',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  const { normalizeMerchant } = await import(
    pathToFileURL(path.join(root, 'src/lib/expenses.ts')).href
  );

  const table = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const headers = table[0].map(h => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), i]));
  const get = (row, name) => (row[idx[name]] ?? '').trim();

  const { data: agents } = await sb.from('agents').select('id, name').order('name');
  const agentList = agents ?? [];

  const accountId = await ensureAccount();
  const { data: existing } = await sb
    .from('business_expenses')
    .select('external_id')
    .eq('source', 'payroll');
  const seenExt = new Set((existing ?? []).map(e => e.external_id).filter(Boolean));

  const toInsert = [];
  let skippedCat = 0;
  let skippedInvalid = 0;
  let skippedDup = 0;
  let matched = 0;
  let unmatched = 0;
  const byVendor = {};

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const category = get(row, 'category');
    if (!PAYROLL_CATEGORIES.has(category.toLowerCase())) {
      skippedCat++;
      continue;
    }
    const date = toYmd(get(row, 'start date'));
    const amount = parseAmount(get(row, 'cost'));
    const vendor = get(row, 'vendor');
    if (!date || amount == null || !vendor) {
      skippedInvalid++;
      continue;
    }

    const type = get(row, 'type');
    const desc = get(row, 'description');
    const ceoBucket = mapType(type);
    const excludeFromPnl = ceoBucket === 'passthrough';
    const agent = matchAgent(vendor, agentList);
    const sub =
      category.toLowerCase() === 'comissions' || category.toLowerCase() === 'commissions'
        ? 'commissions'
        : category.toLowerCase() === 'bonus'
          ? 'bonus'
          : category.toLowerCase() === 'contractor'
            ? 'contractor'
            : 'payroll';

    const payrollRunId = agent
      ? `sheet:${date}:${agent.id}:${sub}`
      : `sheet:${date}:name:${slug(vendor)}:${sub}`;

    const merchant = agent ? `Payroll — ${agent.name}` : `Payroll — ${vendor}`;
    const externalId = `sheet-payroll:${date}:${slug(vendor)}:${amount.toFixed(2)}:${slug(category)}`;

    if (seenExt.has(externalId)) {
      skippedDup++;
      continue;
    }
    seenExt.add(externalId);

    if (agent) matched++;
    else unmatched++;
    byVendor[vendor] = (byVendor[vendor] ?? 0) + 1;

    toInsert.push({
      occurred_on: date,
      amount,
      currency: 'USD',
      account_id: accountId,
      source: 'payroll',
      merchant_raw: merchant,
      merchant_normalized: normalizeMerchant(merchant),
      memo: [desc, `Sheet ${category}`, type ? `Type=${type}` : null, agent ? null : `unmatched vendor: ${vendor}`]
        .filter(Boolean)
        .join(' · '),
      external_id: externalId,
      ceo_bucket: ceoBucket,
      subcategory: sub,
      exclude_from_pnl: excludeFromPnl,
      categorized_by: 'import',
      rule_id: null,
      payroll_run_id: payrollRunId,
      client_id: null,
      updated_at: new Date().toISOString(),
    });
  }

  const total = toInsert.reduce((s, r) => s + r.amount, 0);
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log('would_insert:', toInsert.length);
  console.log('grand_total:', total.toFixed(2));
  console.log('matched_agents:', matched, 'unmatched:', unmatched);
  console.log('skipped_category:', skippedCat, 'invalid:', skippedInvalid, 'dup:', skippedDup);
  console.log('by vendor:', byVendor);
  console.log('sample:', toInsert.slice(0, 8).map(r => ({
    date: r.occurred_on,
    merchant: r.merchant_raw,
    amount: r.amount,
    bucket: r.ceo_bucket,
    sub: r.subcategory,
    run: r.payroll_run_id,
  })));

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  if (!accountId) throw new Error('accountId missing');
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH).map(r => ({ ...r, account_id: accountId }));
    const { error } = await sb.from('business_expenses').insert(chunk);
    if (error) {
      console.error('Insert failed', error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }
  console.log('Done.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
