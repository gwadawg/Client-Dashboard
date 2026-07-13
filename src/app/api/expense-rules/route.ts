import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import {
  applyExpenseRules,
  CEO_BUCKETS,
  MATCH_TYPES,
  SEED_EXPENSE_RULES,
  isCeoBucket,
  isFulfillmentLine,
  type CeoBucket,
  type ExpenseCategoryRule,
  type MatchType,
} from '@/lib/expenses';

const FIELDS =
  'id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, fulfillment_line, exclude_from_pnl, priority, active, notes, created_at, updated_at';

// GET /api/expense-rules
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const { data, error } = await ctx.service
    .from('expense_category_rules')
    .select(FIELDS)
    .order('priority')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [], seed_count: SEED_EXPENSE_RULES.length });
}

// POST /api/expense-rules
// Body: rule fields OR { seed: true } to insert SEED_EXPENSE_RULES (skip existing names)
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  if (body.seed === true) {
    const { data: existing } = await ctx.service.from('expense_category_rules').select('name');
    const have = new Set((existing ?? []).map(r => (r.name as string).toLowerCase()));
    const toInsert = SEED_EXPENSE_RULES.filter(r => !have.has(r.name.toLowerCase())).map(r => ({
      name: r.name,
      match_type: r.match_type,
      match_value: r.match_value,
      amount_min: r.amount_min,
      amount_max: r.amount_max,
      ceo_bucket: r.ceo_bucket,
      subcategory: r.subcategory,
      fulfillment_line: r.ceo_bucket === 'fulfillment' ? (r.fulfillment_line ?? null) : null,
      exclude_from_pnl: r.exclude_from_pnl,
      priority: r.priority,
      active: r.active !== false,
      notes: r.notes,
      updated_at: new Date().toISOString(),
    }));
    if (toInsert.length === 0) {
      return NextResponse.json({ seeded: 0, message: 'All seed rules already present' });
    }
    const { data, error } = await ctx.service.from('expense_category_rules').insert(toInsert).select(FIELDS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ seeded: data?.length ?? 0, rules: data });
  }

  // Re-run all active rules against uncategorized (or all) ledger rows
  if (body.apply === true) {
    const onlyUncategorized = body.only_uncategorized !== false;
    const { data: rules, error: rulesErr } = await ctx.service
      .from('expense_category_rules')
      .select(FIELDS)
      .eq('active', true)
      .order('priority');
    if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

    let query = ctx.service.from('business_expenses').select(
      'id, merchant_raw, memo, amount, ceo_bucket, subcategory, fulfillment_line, exclude_from_pnl, rule_id',
    ).limit(5000);
    if (onlyUncategorized) query = query.eq('ceo_bucket', 'uncategorized');

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

    const now = new Date().toISOString();
    let applied = 0;
    for (const row of rows ?? []) {
      const match = applyExpenseRules(
        {
          merchant_raw: row.merchant_raw,
          memo: row.memo,
          amount: Number(row.amount),
        },
        (rules ?? []) as ExpenseCategoryRule[],
      );
      if (match.ceo_bucket === 'uncategorized') continue;
      const nextLine =
        match.ceo_bucket === 'fulfillment' ? (match.fulfillment_line ?? null) : null;
      if (
        row.ceo_bucket === match.ceo_bucket &&
        (row.subcategory ?? null) === (match.subcategory ?? null) &&
        (row.fulfillment_line ?? null) === nextLine &&
        !!row.exclude_from_pnl === !!match.exclude_from_pnl
      ) {
        continue;
      }
      const { error: upErr } = await ctx.service
        .from('business_expenses')
        .update({
          ceo_bucket: match.ceo_bucket,
          subcategory: match.subcategory,
          fulfillment_line: nextLine,
          exclude_from_pnl: match.exclude_from_pnl,
          categorized_by: 'rule',
          rule_id: match.rule_id,
          updated_at: now,
        })
        .eq('id', row.id);
      if (!upErr) applied += 1;
    }
    return NextResponse.json({ applied, scanned: rows?.length ?? 0, only_uncategorized: onlyUncategorized });
  }

  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (typeof body.match_type !== 'string' || !(MATCH_TYPES as readonly string[]).includes(body.match_type)) {
    return NextResponse.json({ error: `match_type must be one of: ${MATCH_TYPES.join(', ')}` }, { status: 400 });
  }
  if (typeof body.match_value !== 'string' || !body.match_value.trim()) {
    return NextResponse.json({ error: 'match_value is required' }, { status: 400 });
  }
  if (!isCeoBucket(body.ceo_bucket)) {
    return NextResponse.json({ error: `ceo_bucket must be one of: ${CEO_BUCKETS.join(', ')}` }, { status: 400 });
  }

  const row = {
    name: body.name.trim(),
    match_type: body.match_type as MatchType,
    match_value: body.match_value.trim(),
    amount_min: body.amount_min != null ? Number(body.amount_min) : null,
    amount_max: body.amount_max != null ? Number(body.amount_max) : null,
    ceo_bucket: body.ceo_bucket as CeoBucket,
    subcategory: typeof body.subcategory === 'string' ? body.subcategory.trim() || null : null,
    fulfillment_line:
      body.ceo_bucket === 'fulfillment' && isFulfillmentLine(body.fulfillment_line)
        ? body.fulfillment_line
        : null,
    exclude_from_pnl: body.exclude_from_pnl === true,
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
    active: body.active !== false,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service.from('expense_category_rules').insert(row).select(FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}
