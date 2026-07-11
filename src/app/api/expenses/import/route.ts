import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { parseCsv } from '@/lib/csv';
import {
  applyExpenseRules,
  expenseDedupeHash,
  mapLabelToBucket,
  normalizeMerchant,
  type CeoBucket,
  type ExpenseCategoryRule,
} from '@/lib/expenses';

const BATCH = 200;
const FIELDS =
  'id, occurred_on, amount, currency, account_id, source, merchant_raw, merchant_normalized, memo, external_id, ceo_bucket, subcategory, exclude_from_pnl, categorized_by, rule_id';

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
  const col = {
    date: headerIndex(headers, 'date', 'occurred_on', 'transaction date', 'posted date', 'trans date'),
    amount: headerIndex(headers, 'amount', 'debit', 'charge', 'spend'),
    merchant: headerIndex(headers, 'merchant', 'description', 'payee', 'name', 'merchant_raw'),
    memo: headerIndex(headers, 'memo', 'note', 'notes', 'extended description'),
    category: headerIndex(headers, 'category', 'ceo_bucket', 'bucket', 'label', 'type'),
    subcategory: headerIndex(headers, 'subcategory', 'sub category', 'sub_category'),
    account: headerIndex(headers, 'account', 'card', 'account_name'),
    external: headerIndex(headers, 'external_id', 'transaction id', 'txn_id', 'id'),
  };

  const missing: string[] = [];
  if (col.date === -1) missing.push('date');
  if (col.amount === -1) missing.push('amount');
  if (col.merchant === -1) missing.push('merchant');
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
        'id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, exclude_from_pnl, priority, active, notes',
      )
      .eq('active', true);
    rules = (data ?? []) as ExpenseCategoryRule[];
  }

  const { data: existing } = await ctx.service.from('business_expenses').select('external_id').not('external_id', 'is', null);
  const seen = new Set((existing ?? []).map(e => e.external_id as string));

  const rows: ImportRow[] = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  const bucketCounts: Record<string, number> = {};
  const now = new Date().toISOString();

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

    const date = toYmd(get(col.date));
    const amount = parseAmount(get(col.amount));
    const merchant = get(col.merchant);
    if (!date || amount == null || amount === 0 || !merchant) {
      skippedInvalid++;
      continue;
    }

    let accountId = defaultAccountId;
    if (col.account !== -1) {
      const acctName = get(col.account);
      if (acctName) accountId = accountByName.get(acctName.toLowerCase()) ?? defaultAccountId;
    }

    const memo = col.memo !== -1 ? get(col.memo) || null : null;
    const labelBucket = col.category !== -1 ? mapLabelToBucket(get(col.category)) : null;
    const subFromCsv = col.subcategory !== -1 ? get(col.subcategory) || null : null;

    let ceoBucket: CeoBucket = 'uncategorized';
    let subcategory = subFromCsv;
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
      excludeFromPnl = match.exclude_from_pnl;
      categorizedBy = match.categorized_by;
      ruleId = match.rule_id;
    }

    const externalId =
      (col.external !== -1 && get(col.external)) ||
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
      would_insert: rows.length,
      skipped_invalid: skippedInvalid,
      skipped_duplicate: skippedDuplicate,
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

  return NextResponse.json({
    dryRun: false,
    inserted,
    skipped_invalid: skippedInvalid,
    skipped_duplicate: skippedDuplicate,
    bucket_counts: bucketCounts,
  });
}
