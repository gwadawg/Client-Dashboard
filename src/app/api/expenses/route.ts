import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import {
  applyExpenseRules,
  expenseDedupeHash,
  isCeoBucket,
  normalizeMerchant,
  type CeoBucket,
  type ExpenseCategoryRule,
  type ExpenseSource,
} from '@/lib/expenses';

const FIELDS =
  'id, occurred_on, amount, currency, account_id, source, merchant_raw, merchant_normalized, memo, external_id, ceo_bucket, subcategory, exclude_from_pnl, categorized_by, rule_id, payroll_run_id, client_id, created_at, updated_at';

const RULE_FIELDS =
  'id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, exclude_from_pnl, priority, active, notes';

// GET /api/expenses?month=YYYY-MM&bucket=&account_id=&uncategorized=1&limit=
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const sp = new URL(req.url).searchParams;
  const month = sp.get('month');
  const bucket = sp.get('bucket');
  const accountId = sp.get('account_id');
  const uncategorized = sp.get('uncategorized') === '1' || sp.get('uncategorized') === 'true';
  const limit = Math.min(Number(sp.get('limit') || 500) || 500, 2000);

  let query = ctx.service
    .from('business_expenses')
    .select(FIELDS)
    .order('occurred_on', { ascending: false })
    .limit(limit);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.gte('occurred_on', start).lt('occurred_on', next);
  }
  if (uncategorized) query = query.eq('ceo_bucket', 'uncategorized');
  else if (bucket && isCeoBucket(bucket)) query = query.eq('ceo_bucket', bucket);
  if (accountId) query = query.eq('account_id', accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: data ?? [] });
}

// POST /api/expenses — manual charge
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const occurredOn =
    typeof body.occurred_on === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.occurred_on)
      ? body.occurred_on.slice(0, 10)
      : null;
  const amount = Number(body.amount);
  if (!occurredOn) return NextResponse.json({ error: 'occurred_on (YYYY-MM-DD) is required' }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'amount must be a non-zero number' }, { status: 400 });
  }

  const merchantRaw = typeof body.merchant_raw === 'string' ? body.merchant_raw.trim() : '';
  const memo = typeof body.memo === 'string' ? body.memo.trim() || null : null;
  const accountId = typeof body.account_id === 'string' && body.account_id ? body.account_id : null;
  const absAmount = Math.abs(amount);

  let ceoBucket: CeoBucket = 'uncategorized';
  let subcategory: string | null = typeof body.subcategory === 'string' ? body.subcategory.trim() || null : null;
  let excludeFromPnl = body.exclude_from_pnl === true;
  let categorizedBy: 'rule' | 'user' | 'import' | null = null;
  let ruleId: string | null = null;

  if (isCeoBucket(body.ceo_bucket) && body.ceo_bucket !== 'uncategorized') {
    ceoBucket = body.ceo_bucket;
    categorizedBy = 'user';
  } else {
    const { data: rules } = await ctx.service
      .from('expense_category_rules')
      .select(RULE_FIELDS)
      .eq('active', true);
    const match = applyExpenseRules(
      { merchant_raw: merchantRaw, memo, amount: absAmount },
      (rules ?? []) as ExpenseCategoryRule[],
    );
    ceoBucket = match.ceo_bucket;
    subcategory = subcategory ?? match.subcategory;
    excludeFromPnl = excludeFromPnl || match.exclude_from_pnl;
    categorizedBy = match.categorized_by;
    ruleId = match.rule_id;
  }

  // Auto-exclude personal / owner_draw from P&L unless explicitly overridden
  if ((ceoBucket === 'personal' || ceoBucket === 'owner_draw' || ceoBucket === 'passthrough') && body.exclude_from_pnl !== false) {
    excludeFromPnl = true;
  }

  const externalId =
    typeof body.external_id === 'string' && body.external_id.trim()
      ? body.external_id.trim()
      : expenseDedupeHash({
          account_id: accountId,
          occurred_on: occurredOn,
          amount: absAmount,
          merchant_raw: merchantRaw,
        });

  const row = {
    occurred_on: occurredOn,
    amount: absAmount,
    currency: typeof body.currency === 'string' ? body.currency : 'USD',
    account_id: accountId,
    source: 'manual' as ExpenseSource,
    merchant_raw: merchantRaw || null,
    merchant_normalized: normalizeMerchant(merchantRaw) || null,
    memo,
    external_id: externalId,
    ceo_bucket: ceoBucket,
    subcategory,
    exclude_from_pnl: excludeFromPnl,
    categorized_by: categorizedBy,
    rule_id: ruleId,
    payroll_run_id: null,
    client_id: typeof body.client_id === 'string' ? body.client_id : null,
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service.from('business_expenses').insert(row).select(FIELDS).single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Duplicate expense (same account/date/amount/merchant)' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ expense: data });
}
