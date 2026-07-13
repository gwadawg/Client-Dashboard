import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { parseCsv } from '@/lib/csv';
import {
  applyExpenseRules,
  chaseExternalId,
  cleanBankMerchant,
  expenseDedupeHash,
  isChaseActivityCsv,
  mapLabelToBucket,
  normalizeMerchant,
  resolveAcquisitionCostChannel,
  type CeoBucket,
  type ExpenseCategoryRule,
} from '@/lib/expenses';
import { rollupExpenseDates } from '@/lib/expense-rollup';

const BATCH = 200;
const FIELDS =
  'id, occurred_on, amount, currency, account_id, source, merchant_raw, merchant_normalized, memo, external_id, ceo_bucket, subcategory, fulfillment_line, acquisition_cost_channel, exclude_from_pnl, categorized_by, rule_id';

function headerIndex(headers: string[], ...candidates: string[]): number {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(value: string): number | null {
  if (value == null || value.trim() === '') return null;
  const cleaned = value.replace(/[$,\s]/g, '');
  // Credit card exports often show charges as positive; some show debits as negative.
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function toYmd(value: string): string | null {
  const s = (value ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, yRaw] = mdy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

type ImportRow = {
  occurred_on: string;
  amount: number;
  currency: string;
  account_id: string | null;
  source: 'csv_import';
  merchant_raw: string | null;
  merchant_normalized: string | null;
  memo: string | null;
  external_id: string;
  ceo_bucket: CeoBucket;
  subcategory: string | null;
  fulfillment_line: string | null;
  acquisition_cost_channel: string | null;
  exclude_from_pnl: boolean;
  categorized_by: 'rule' | 'user' | 'import' | null;
  rule_id: string | null;
  created_by: string | null;
  updated_at: string;
};

// POST /api/expenses/import
// Body: { csv, account_id?, dryRun?, apply_rules? }
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const csv: string = body?.csv ?? '';
  const dryRun: boolean = body?.dryRun !== false;
  const applyRules: boolean = body?.apply_rules !== false;
  const defaultAccountId: string | null =
    typeof body?.account_id === 'string' && body.account_id ? body.account_id : null;

  if (!csv.trim()) return NextResponse.json({ error: 'csv is required' }, { status: 400 });

  const table = parseCsv(csv);
  if (table.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });

  const headers = table[0].map(h => h.trim());
  const chase = isChaseActivityCsv(headers);
  const col = {
    date: headerIndex(
      headers,
      'date',
      'start date',
      'occurred_on',
      'transaction date',
      'posted date',
      'posting date',
      'trans date',
    ),
    amount: headerIndex(headers, 'amount', 'cost', 'debit', 'charge', 'spend'),
    merchant: headerIndex(headers, 'vendor', 'merchant', 'payee', 'name', 'merchant_raw'),
    memo: headerIndex(headers, 'description', 'memo', 'note', 'notes', 'extended description'),
    // WM Company Report: Type = CAC/COGS/Overhead/Passthrough (CEO bucket)
    // Chase: Type = MISC_DEBIT / DEBIT_CARD — ignored via mapLabelToBucket null
    type: headerIndex(headers, 'type', 'ceo_bucket', 'bucket', 'label'),
    // WM Company Report: Category = Software/Payroll/Ad Spend (subcategory)
    category: headerIndex(headers, 'category', 'subcategory', 'sub category', 'sub_category'),
    account: headerIndex(headers, 'account', 'card', 'account_name'),
    external: headerIndex(headers, 'external_id', 'transaction id', 'txn_id', 'id'),
    client: headerIndex(headers, 'client', 'client_name'),
    details: headerIndex(headers, 'details'),
    balance: headerIndex(headers, 'balance'),
  };

  const missing: string[] = [];
  if (col.date === -1) missing.push('date / start date / posting date');
  if (col.amount === -1) missing.push('amount / cost');
  // Chase uses Description as merchant; labeled sheets use Vendor
  if (col.merchant === -1 && col.memo === -1) missing.push('vendor / merchant / description');
  if (missing.length) {
    return NextResponse.json({ error: `Missing required column(s): ${missing.join(', ')}` }, { status: 400 });
  }

  // Resolve account names if CSV has an account column
  const { data: accounts } = await ctx.service.from('finance_accounts').select('id, name');
  const accountByName = new Map<string, string>();
  for (const a of accounts ?? []) accountByName.set(a.name.trim().toLowerCase(), a.id);

  let rules: ExpenseCategoryRule[] = [];
  if (applyRules) {
    const { data } = await ctx.service
      .from('expense_category_rules')
      .select(
        'id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, fulfillment_line, acquisition_cost_channel, exclude_from_pnl, priority, active, notes',
      )
      .eq('active', true);
    rules = (data ?? []) as ExpenseCategoryRule[];
  }

  const { data: existing } = await ctx.service.from('business_expenses').select('external_id').not('external_id', 'is', null);
  const seen = new Set((existing ?? []).map(e => e.external_id as string));

  const rows: ImportRow[] = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  let skippedCredit = 0;
  const bucketCounts: Record<string, number> = {};
  const now = new Date().toISOString();

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

    // Chase Activity: only money-out (DEBIT). Credits are Stripe/income — not expenses.
    if (chase && col.details !== -1) {
      const details = get(col.details).toUpperCase();
      if (details === 'CREDIT') {
        skippedCredit++;
        continue;
      }
    }

    const date = toYmd(get(col.date));
    const amount = parseAmount(get(col.amount));
    const rawDesc = col.memo !== -1 ? get(col.memo) : '';
    const vendorCol = col.merchant !== -1 ? get(col.merchant) : '';
    const merchant = chase
      ? cleanBankMerchant(rawDesc || vendorCol) || rawDesc.slice(0, 80) || vendorCol
      : vendorCol || cleanBankMerchant(rawDesc) || rawDesc.slice(0, 80);

    if (!date || amount == null || amount === 0 || !merchant) {
      skippedInvalid++;
      continue;
    }

    let accountId = defaultAccountId;
    if (col.account !== -1) {
      const acctName = get(col.account);
      if (acctName) accountId = accountByName.get(acctName.toLowerCase()) ?? defaultAccountId;
    }

    const memo = chase ? (rawDesc || null) : col.memo !== -1 ? get(col.memo) || null : null;
    // Prefer Type (CEO bucket) over Category — but not Chase bank Type codes
    const typeLabel = chase ? '' : col.type !== -1 ? get(col.type) : '';
    const categoryLabel = col.category !== -1 ? get(col.category) : '';
    const labelBucket = mapLabelToBucket(typeLabel) ?? mapLabelToBucket(categoryLabel);
    const subFromCsv = categoryLabel || null;

    let ceoBucket: CeoBucket = 'uncategorized';
    let subcategory = subFromCsv;
    let fulfillmentLine: string | null = null;
    let acquisitionChannel: string | null = null;
    let excludeFromPnl = false;
    let categorizedBy: ImportRow['categorized_by'] = null;
    let ruleId: string | null = null;

    if (labelBucket) {
      ceoBucket = labelBucket;
      categorizedBy = 'import';
      if (ceoBucket === 'personal' || ceoBucket === 'owner_draw' || ceoBucket === 'passthrough') {
        excludeFromPnl = true;
      }
    } else if (applyRules) {
      const match = applyExpenseRules({ merchant_raw: merchant, memo, amount }, rules);
      ceoBucket = match.ceo_bucket;
      subcategory = subcategory ?? match.subcategory;
      fulfillmentLine = match.fulfillment_line;
      acquisitionChannel = match.acquisition_cost_channel;
      excludeFromPnl = match.exclude_from_pnl;
      categorizedBy = match.categorized_by;
      ruleId = match.rule_id;
    }

    if (ceoBucket !== 'fulfillment') fulfillmentLine = null;
    if (ceoBucket === 'cac') {
      acquisitionChannel =
        acquisitionChannel ??
        resolveAcquisitionCostChannel({
          ceo_bucket: 'cac',
          subcategory,
          merchant_raw: merchant,
          source: 'csv_import',
        });
      if (acquisitionChannel === 'meta_media') excludeFromPnl = true;
    } else {
      acquisitionChannel = null;
    }

    const externalId = chase
      ? chaseExternalId({
          account_id: accountId,
          occurred_on: date,
          amount,
          description: rawDesc || merchant,
          balance: col.balance !== -1 ? get(col.balance) : null,
          rowIndex: r,
        })
      : (col.external !== -1 && get(col.external)) ||
        expenseDedupeHash({
          account_id: accountId,
          occurred_on: date,
          amount,
          merchant_raw: merchant,
        });

    if (seen.has(externalId)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(externalId);

    bucketCounts[ceoBucket] = (bucketCounts[ceoBucket] ?? 0) + 1;
    rows.push({
      occurred_on: date,
      amount,
      currency: 'USD',
      account_id: accountId,
      source: 'csv_import',
      merchant_raw: merchant,
      merchant_normalized: normalizeMerchant(merchant) || null,
      memo,
      external_id: externalId,
      ceo_bucket: ceoBucket,
      subcategory,
      fulfillment_line: fulfillmentLine,
      acquisition_cost_channel: acquisitionChannel,
      exclude_from_pnl: excludeFromPnl,
      categorized_by: categorizedBy,
      rule_id: ruleId,
      created_by: ctx.userId,
      updated_at: now,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      format: chase ? 'chase_activity' : 'generic',
      would_insert: rows.length,
      skipped_invalid: skippedInvalid,
      skipped_duplicate: skippedDuplicate,
      skipped_credit: skippedCredit,
      bucket_counts: bucketCounts,
      sample: rows.slice(0, 10),
    });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await ctx.service.from('business_expenses').insert(chunk);
    if (error) return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    inserted += chunk.length;
  }

  let rollups = null;
  let warning: string | undefined;
  try {
    rollups = await rollupExpenseDates(
      ctx.service,
      rows.map(r => r.occurred_on),
      ctx.userId,
    );
  } catch (e) {
    warning = e instanceof Error ? e.message : 'Import saved but KPI rollup failed';
  }

  return NextResponse.json({
    dryRun: false,
    format: chase ? 'chase_activity' : 'generic',
    inserted,
    skipped_invalid: skippedInvalid,
    skipped_duplicate: skippedDuplicate,
    skipped_credit: skippedCredit,
    bucket_counts: bucketCounts,
    rollups,
    ...(warning ? { warning } : {}),
  });
}
