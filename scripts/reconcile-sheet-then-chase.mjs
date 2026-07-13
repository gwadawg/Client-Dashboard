#!/usr/bin/env node
/**
 * Hybrid ledger reconcile:
 *   - Sheet (Total Costs) = source of truth through SHEET_END (inclusive)
 *   - Chase bank = source of truth from the day after SHEET_END
 *   - Chase before sheet start (e.g. 2024-10..2024-12) is kept
 *
 * Default SHEET_END = 2026-01-31 (last dense sheet month; Feb–Jul 2026 sheet
 * rows look like thin stubs repeating the same ~$1,137 software set).
 *
 *   npx tsx scripts/reconcile-sheet-then-chase.mjs           # dry-run
 *   npx tsx scripts/reconcile-sheet-then-chase.mjs --apply
 *   npx tsx scripts/reconcile-sheet-then-chase.mjs --apply --sheet-end=2026-01-31
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const endArg = process.argv.find(a => a.startsWith('--sheet-end='));
const SHEET_END = endArg ? endArg.slice('--sheet-end='.length) : '2026-01-31';
const SHEET_START = '2025-01-01';
const csvPath = path.join(root, 'data/import/expenses/wm-company-total-costs-labeled.csv');

const PAYROLL_CATEGORIES = new Set([
  'payroll',
  'comissions',
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

function matchAgent(vendor, agents) {
  const v = normName(vendor);
  if (!v) return null;
  for (const a of agents) {
    const n = normName(a.name);
    if (n === v || n.includes(v) || v.includes(n)) return a;
  }
  const first = v.split(' ')[0];
  if (first.length < 3) return null;
  const hits = agents.filter(a => {
    const parts = normName(a.name).split(' ');
    return parts[0] === first || parts.includes(first);
  });
  return hits.length === 1 ? hits[0] : null;
}

function nextDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function ensureAccount(name, notes) {
  const { data: existing } = await sb.from('finance_accounts').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  if (!apply) {
    console.log('[dry-run] would create account', name);
    return `dry-${slug(name)}`;
  }
  const { data, error } = await sb.from('finance_accounts').insert({
    name,
    institution: 'Waiz Media books',
    account_type: 'other',
    entity: 'Waiz Media',
    is_business: true,
    active: true,
    notes,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(SHEET_END)) {
    console.error('Invalid --sheet-end=YYYY-MM-DD');
    process.exit(1);
  }
  const chaseFrom = nextDay(SHEET_END);
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log(`Sheet SoT: ${SHEET_START} → ${SHEET_END}`);
  console.log(`Chase SoT: ${chaseFrom} onward (+ any Chase before ${SHEET_START})`);

  const helpers = await import(pathToFileURL(path.join(root, 'src/lib/expenses.ts')).href);
  const { normalizeMerchant } = helpers;

  // ── 1. Count what we will remove ──────────────────────────────────────────
  const { count: chaseOverlap } = await sb
    .from('business_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'csv_import')
    .gte('occurred_on', SHEET_START)
    .lte('occurred_on', SHEET_END);

  const { count: oldSheetPayroll } = await sb
    .from('business_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'payroll')
    .like('external_id', 'sheet-payroll:%');

  console.log('Would delete Chase in sheet window:', chaseOverlap);
  console.log('Would delete prior sheet-payroll backfill:', oldSheetPayroll);

  // ── 2. Build sheet import rows through SHEET_END ──────────────────────────
  const table = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const headers = table[0].map(h => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), i]));
  const get = (row, name) => (row[idx[name]] ?? '').trim();

  const { data: agents } = await sb.from('agents').select('id, name');
  const agentList = agents ?? [];
  const booksId = await ensureAccount('WM Company Books', 'Labeled Total Costs sheet (SoT through sheet-end)');
  const payrollAcctId = await ensureAccount('WM Payroll (sheet)', 'Sheet payroll/commissions through sheet-end');

  const toInsert = [];
  let skippedAfter = 0;
  let skippedInvalid = 0;
  const bucketCounts = {};
  const seen = new Set();

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const date = toYmd(get(row, 'start date'));
    const amount = parseAmount(get(row, 'cost'));
    const vendor = get(row, 'vendor');
    if (!date || amount == null || !vendor) {
      skippedInvalid++;
      continue;
    }
    if (date < SHEET_START || date > SHEET_END) {
      skippedAfter++;
      continue;
    }

    const type = get(row, 'type');
    const category = get(row, 'category');
    const desc = get(row, 'description');
    const isPayroll = PAYROLL_CATEGORIES.has(category.toLowerCase());
    const ceoBucket = mapType(type);
    const excludeFromPnl = ceoBucket === 'passthrough';

    let source = 'csv_import';
    let subcategory = category || null;
    let merchant = vendor;
    let payrollRunId = null;
    let accountId = booksId;
    let externalId = `sheet:${date}:${slug(vendor)}:${amount.toFixed(2)}:${slug(category || type || 'x')}`;

    if (isPayroll) {
      source = 'payroll';
      accountId = payrollAcctId;
      const sub =
        category.toLowerCase() === 'comissions' || category.toLowerCase() === 'commissions'
          ? 'commissions'
          : category.toLowerCase() === 'bonus'
            ? 'bonus'
            : category.toLowerCase() === 'contractor'
              ? 'contractor'
              : 'payroll';
      subcategory = sub;
      const agent = matchAgent(vendor, agentList);
      merchant = agent ? `Payroll — ${agent.name}` : `Payroll — ${vendor}`;
      payrollRunId = agent
        ? `sheet:${date}:${agent.id}:${sub}`
        : `sheet:${date}:name:${slug(vendor)}:${sub}`;
      externalId = `sheet-payroll:${date}:${slug(vendor)}:${amount.toFixed(2)}:${slug(category)}`;
    }

    if (seen.has(externalId)) continue;
    seen.add(externalId);

    bucketCounts[ceoBucket] = (bucketCounts[ceoBucket] ?? 0) + 1;
    toInsert.push({
      occurred_on: date,
      amount,
      currency: 'USD',
      account_id: accountId,
      source,
      merchant_raw: merchant,
      merchant_normalized: normalizeMerchant(merchant) || null,
      memo: [desc, category ? `Sheet ${category}` : null, type ? `Type=${type}` : null]
        .filter(Boolean)
        .join(' · ') || null,
      external_id: externalId,
      ceo_bucket: ceoBucket,
      subcategory,
      exclude_from_pnl: excludeFromPnl,
      categorized_by: 'import',
      rule_id: null,
      payroll_run_id: payrollRunId,
      client_id: null,
      updated_at: new Date().toISOString(),
    });
  }

  const sheetTotal = toInsert.reduce((s, r) => s + r.amount, 0);
  const payrollN = toInsert.filter(r => r.source === 'payroll').length;
  const otherN = toInsert.length - payrollN;

  // Chase remaining after delete
  const { count: chaseKeepBefore } = await sb
    .from('business_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'csv_import')
    .lt('occurred_on', SHEET_START);
  const { count: chaseKeepAfter } = await sb
    .from('business_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'csv_import')
    .gte('occurred_on', chaseFrom);

  console.log('\n=== Plan ===');
  console.log('Insert sheet rows:', toInsert.length, `(payroll ${payrollN}, other ${otherN})`);
  console.log('Sheet $ total:', sheetTotal.toFixed(2));
  console.log('Skipped sheet after end / before start:', skippedAfter, 'invalid:', skippedInvalid);
  console.log('bucket_counts:', bucketCounts);
  console.log('Chase kept before sheet:', chaseKeepBefore, '| Chase kept after sheet-end:', chaseKeepAfter);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  // ── 3. Delete overlaps ────────────────────────────────────────────────────
  {
    const { data, error } = await sb
      .from('business_expenses')
      .delete()
      .eq('source', 'csv_import')
      .gte('occurred_on', SHEET_START)
      .lte('occurred_on', SHEET_END)
      .select('id');
    if (error) throw new Error(error.message);
    console.log('Deleted Chase in sheet window:', data?.length ?? 0);
  }
  {
    const { data, error } = await sb
      .from('business_expenses')
      .delete()
      .eq('source', 'payroll')
      .like('external_id', 'sheet-payroll:%')
      .select('id');
    if (error) throw new Error(error.message);
    console.log('Deleted old sheet-payroll backfill:', data?.length ?? 0);
  }

  // ── 4. Insert sheet ───────────────────────────────────────────────────────
  const realBooks = typeof booksId === 'string' && !booksId.startsWith('dry-') ? booksId : null;
  const realPay = typeof payrollAcctId === 'string' && !payrollAcctId.startsWith('dry-') ? payrollAcctId : null;
  if (!realBooks || !realPay) throw new Error('accounts missing');

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH).map(r => ({
      ...r,
      account_id: r.source === 'payroll' ? realPay : realBooks,
    }));
    const { error } = await sb.from('business_expenses').insert(chunk);
    if (error) {
      console.error('Insert failed', error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  // ── 5. Roll up all months ─────────────────────────────────────────────────
  const { rollupExpensesForMonth, periodDateFromMonth } = helpers;
  const { data: expenses } = await sb
    .from('business_expenses')
    .select('occurred_on, amount, ceo_bucket, exclude_from_pnl');
  const months = [...new Set((expenses ?? []).map(e => e.occurred_on.slice(0, 7)))].sort();
  for (const month of months) {
    const r = rollupExpensesForMonth(expenses, month);
    const period = periodDateFromMonth(month);
    for (const [key, val] of [
      ['marketing_spend', r.marketing_spend],
      ['delivery_costs', r.delivery_costs],
      ['operating_expenses', r.operating_expenses],
    ]) {
      const { data: found } = await sb
        .from('business_metrics')
        .select('id')
        .eq('metric_key', key)
        .eq('period_date', period)
        .is('dimension', null)
        .maybeSingle();
      if (found) {
        await sb
          .from('business_metrics')
          .update({ value_numeric: val, notes: 'Rolled up from business_expenses ledger' })
          .eq('id', found.id);
      } else {
        await sb.from('business_metrics').insert({
          metric_key: key,
          period_date: period,
          value_numeric: val,
          dimension: null,
          notes: 'Rolled up from business_expenses ledger',
        });
      }
    }
  }
  console.log('Rolled', months.length, 'months. Done.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
