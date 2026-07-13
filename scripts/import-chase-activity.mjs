#!/usr/bin/env node
/**
 * Import Chase Activity CSV into business_expenses (debits only).
 * Dedupes on chase:trn: / chase:txn: / chase:ref: / salted hash.
 *
 *   node scripts/import-chase-activity.mjs                 # dry-run
 *   node scripts/import-chase-activity.mjs --apply         # write
 *
 * By default skips any YYYY-MM already covered by the Total Costs sheet
 * (WM Company Books) so bank lines do not double-count labeled months.
 *
 *   --retire-sheet   DELETE Total Costs sheet rows, then import all Chase months
 *   --allow-overlap  import Chase even for sheet-covered months (double-counts if sheet kept)
 *
 * Default file: data/import/expenses/chase1519-activity-20260710.csv
 * Or: --file=/path/to/Chase.csv
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const retireSheet = process.argv.includes('--retire-sheet');
const allowOverlap = process.argv.includes('--allow-overlap');
const fileArg = process.argv.find(a => a.startsWith('--file='));
const csvPath = fileArg
  ? path.resolve(fileArg.slice('--file='.length))
  : path.join(root, 'data/import/expenses/chase1519-activity-20260710.csv');

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

async function loadExpenseHelpers() {
  try {
    const mod = await import(pathToFileURL(path.join(root, 'src/lib/expenses.ts')).href);
    return mod;
  } catch (e) {
    console.error('Need to load src/lib/expenses.ts — run with: npx tsx scripts/import-chase-activity.mjs');
    console.error(e.message);
    process.exit(1);
  }
}

async function ensureChaseAccount() {
  const name = 'Chase Business Checking …1519';
  const { data: existing } = await sb.from('finance_accounts').select('id, name').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  if (!apply) {
    console.log('[dry-run] would create finance_accounts:', name);
    return null;
  }
  const { data, error } = await sb.from('finance_accounts').insert({
    name,
    institution: 'Chase',
    account_type: 'checking',
    entity: 'Waiz Media',
    is_business: true,
    active: true,
    last4: '1519',
    notes: 'Imported from Chase Activity CSV',
  }).select('id').single();
  if (error) throw new Error(error.message);
  console.log('Created account', name, data.id);
  return data.id;
}

async function retireTotalCostsSheet() {
  const { data: acct } = await sb.from('finance_accounts').select('id').eq('name', 'WM Company Books').maybeSingle();
  if (!acct?.id) {
    console.warn('WM Company Books account not found — skipping retire');
    return { retired: 0 };
  }

  const { count } = await sb
    .from('business_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', acct.id)
    .eq('source', 'csv_import');

  if (!apply) {
    console.log(`[dry-run] would DELETE ${count ?? '?'} Total Costs rows on WM Company Books`);
    return { retired: count ?? 0 };
  }

  // Remove monthly sheet summaries so Chase line items are the only ledger for those months.
  const { data, error } = await sb
    .from('business_expenses')
    .delete()
    .eq('account_id', acct.id)
    .eq('source', 'csv_import')
    .select('id');
  if (error) throw new Error(error.message);
  console.log('Deleted Total Costs sheet rows:', data?.length ?? 0);
  return { retired: data?.length ?? 0 };
}

async function upsertBankRules(helpers) {
  const wanted = helpers.SEED_EXPENSE_RULES.filter(r =>
    /gabes personal|american express|monthly service fee|overdraft|wire fee|wise fee|fathom|ideogram|higgsfield/i.test(r.name),
  );
  const { data: existing } = await sb.from('expense_category_rules').select('id, name');
  const byName = new Map((existing ?? []).map(r => [r.name.toLowerCase(), r]));

  // Disable old broad "Wise fee" if present
  const oldWise = byName.get('wise fee');
  if (oldWise && apply) {
    await sb.from('expense_category_rules').update({ active: false, notes: 'Replaced by Wise fee (small)' }).eq('id', oldWise.id);
    console.log('Disabled broad Wise fee rule');
  }

  let inserted = 0;
  for (const r of wanted) {
    if (byName.has(r.name.toLowerCase())) continue;
    if (!apply) {
      inserted++;
      continue;
    }
    const { error } = await sb.from('expense_category_rules').insert({ ...r, active: true });
    if (error) console.warn('rule insert', r.name, error.message);
    else inserted++;
  }
  console.log(apply ? `Inserted ${inserted} bank rules` : `[dry-run] would insert ${inserted} bank rules`);
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  const helpers = await loadExpenseHelpers();
  const {
    applyExpenseRules,
    chaseExternalId,
    cleanBankMerchant,
    normalizeMerchant,
    isChaseActivityCsv,
  } = helpers;

  const text = fs.readFileSync(csvPath, 'utf8');
  const table = parseCsv(text);
  const headers = table[0].map(h => h.trim());
  if (!isChaseActivityCsv(headers)) {
    console.error('Not a Chase Activity CSV. Headers:', headers);
    process.exit(1);
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), i]));
  const get = (row, name) => (row[idx[name]] ?? '').trim();

  console.log('File:', csvPath);
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log('Rows in file:', table.length - 1);

  const accountId = await ensureChaseAccount();
  await upsertBankRules(helpers);

  if (retireSheet) {
    await retireTotalCostsSheet();
  }

  /** Months already covered by the labeled Total Costs sheet — do not import Chase for these. */
  const sheetMonths = new Set();
  if (!allowOverlap && !retireSheet) {
    const { data: sheetAcct } = await sb
      .from('finance_accounts')
      .select('id')
      .eq('name', 'WM Company Books')
      .maybeSingle();
    if (sheetAcct?.id) {
      const { data: sheetRows } = await sb
        .from('business_expenses')
        .select('occurred_on')
        .eq('account_id', sheetAcct.id)
        .eq('source', 'csv_import');
      for (const r of sheetRows ?? []) {
        if (r.occurred_on) sheetMonths.add(String(r.occurred_on).slice(0, 7));
      }
    }
    console.log(
      'Skipping Chase months already in Total Costs sheet:',
      [...sheetMonths].sort().join(', ') || '(none)',
    );
  } else if (allowOverlap) {
    console.log('WARNING: --allow-overlap — Chase may double-count Total Costs months');
  }

  const { data: rules } = await sb
    .from('expense_category_rules')
    .select('id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, exclude_from_pnl, priority, active, notes')
    .eq('active', true);

  // Merge in seed bank rules for dry-run matching if DB missing them
  const ruleList = [...(rules ?? [])];
  for (const r of helpers.SEED_EXPENSE_RULES) {
    if (!ruleList.some(x => x.name.toLowerCase() === r.name.toLowerCase())) {
      ruleList.push({ ...r, id: `seed-${r.name}`, active: true });
    }
  }
  // Prefer small Wise fee over broad
  const filtered = ruleList.filter(r => r.name.toLowerCase() !== 'wise fee');

  const { data: existing } = await sb.from('business_expenses').select('external_id').not('external_id', 'is', null);
  const seen = new Set((existing ?? []).map(e => e.external_id));

  const toInsert = [];
  let skippedCredit = 0;
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  let skippedSheetMonth = 0;
  const bucketCounts = {};
  const merchantCounts = {};
  const insertByMonth = {};

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const details = get(row, 'details').toUpperCase();
    if (details === 'CREDIT') {
      skippedCredit++;
      continue;
    }

    const date = toYmd(get(row, 'posting date'));
    const amount = parseAmount(get(row, 'amount'));
    const description = get(row, 'description');
    const balance = get(row, 'balance');
    const merchant = cleanBankMerchant(description) || description.slice(0, 80);

    if (!date || amount == null || amount === 0 || !merchant) {
      skippedInvalid++;
      continue;
    }

    const month = date.slice(0, 7);
    if (sheetMonths.has(month)) {
      skippedSheetMonth++;
      continue;
    }

    const externalId = chaseExternalId({
      account_id: accountId,
      occurred_on: date,
      amount,
      description,
      balance,
      rowIndex: r,
    });

    if (seen.has(externalId)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(externalId);

    const match = applyExpenseRules({ merchant_raw: merchant, memo: description, amount }, filtered);
    bucketCounts[match.ceo_bucket] = (bucketCounts[match.ceo_bucket] ?? 0) + 1;
    merchantCounts[merchant] = (merchantCounts[merchant] ?? 0) + 1;
    insertByMonth[month] = (insertByMonth[month] ?? 0) + 1;

    toInsert.push({
      occurred_on: date,
      amount,
      currency: 'USD',
      account_id: accountId,
      source: 'csv_import',
      merchant_raw: merchant,
      merchant_normalized: normalizeMerchant(merchant) || null,
      memo: description,
      external_id: externalId,
      ceo_bucket: match.ceo_bucket,
      subcategory: match.subcategory,
      exclude_from_pnl: match.exclude_from_pnl,
      categorized_by: match.categorized_by,
      rule_id: match.rule_id?.startsWith('seed-') ? null : match.rule_id,
      updated_at: new Date().toISOString(),
    });
  }

  // Internal file dedupe check
  const ids = toInsert.map(r => r.external_id);
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) {
    console.error('INTERNAL DEDUPE FAILURE: colliding external_ids within file', ids.length - uniq.size);
    process.exit(1);
  }

  console.log('\n=== Chase import summary ===');
  console.log('would_insert:', toInsert.length);
  console.log('insert_by_month:', insertByMonth);
  console.log('skipped_credit (income):', skippedCredit);
  console.log('skipped_invalid:', skippedInvalid);
  console.log('skipped_duplicate (already in DB):', skippedDuplicate);
  console.log('skipped_sheet_month (Total Costs covered):', skippedSheetMonth);
  console.log('bucket_counts:', bucketCounts);
  console.log('\nTop merchants to insert:');
  Object.entries(merchantCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([m, n]) => console.log(`  ${String(n).padStart(4)}  ${m}`));

  console.log('\nSample rows:');
  for (const s of toInsert.slice(0, 8)) {
    console.log(`  ${s.occurred_on}  $${s.amount.toFixed(2).padStart(10)}  [${s.ceo_bucket}]  ${s.merchant_raw}  ${s.external_id}`);
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    console.log('Default skips Total Costs months. Use --allow-overlap only if you intend to double-count.');
    return;
  }

  if (!accountId) throw new Error('accountId missing on apply');

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH).map(r => ({ ...r, account_id: accountId }));
    const { error } = await sb.from('business_expenses').insert(chunk);
    if (error) {
      console.error('Insert failed at', inserted, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }
  console.log('Done. Inserted', inserted);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
