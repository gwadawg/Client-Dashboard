import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import {
  applyExpenseRules,
  isCeoBucket,
  normalizeMerchant,
  suggestRuleNeedle,
  type CeoBucket,
  type ExpenseCategoryRule,
} from '@/lib/expenses';

const FIELDS =
  'id, occurred_on, amount, currency, account_id, source, merchant_raw, merchant_normalized, memo, external_id, ceo_bucket, subcategory, exclude_from_pnl, categorized_by, rule_id, payroll_run_id, client_id, created_at, updated_at';

type Ctx = Exclude<Awaited<ReturnType<typeof getAuthContext>>, NextResponse>;

async function loadExpense(ctx: Ctx, id: string) {
  return ctx.service.from('business_expenses').select(FIELDS).eq('id', id).maybeSingle();
}

function defaultExclude(bucket: CeoBucket): boolean {
  return bucket === 'personal' || bucket === 'owner_draw' || bucket === 'passthrough';
}

// PATCH /api/expenses/[id] — recategorize / edit / optionally create rule
// Body extras:
//   create_rule?: boolean
//   rule_match_value?: string  (merchant_contains needle)
//   rule_name?: string
//   apply_to_matching?: boolean  (re-bucket other uncategorized that match the new rule)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { data: existing, error: findErr } = await loadExpense(ctx, id);
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.occurred_on === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.occurred_on)) {
    patch.occurred_on = body.occurred_on.slice(0, 10);
  }
  if (body.amount != null) {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n === 0) {
      return NextResponse.json({ error: 'amount must be a non-zero number' }, { status: 400 });
    }
    patch.amount = Math.abs(n);
  }
  if (typeof body.merchant_raw === 'string') {
    patch.merchant_raw = body.merchant_raw.trim() || null;
    patch.merchant_normalized = normalizeMerchant(body.merchant_raw) || null;
  }
  if (typeof body.memo === 'string') patch.memo = body.memo.trim() || null;
  if (body.account_id === null) patch.account_id = null;
  else if (typeof body.account_id === 'string') patch.account_id = body.account_id;

  let newBucket: CeoBucket | null = null;
  if (isCeoBucket(body.ceo_bucket)) {
    newBucket = body.ceo_bucket as CeoBucket;
    patch.ceo_bucket = newBucket;
    patch.categorized_by = 'user';
    patch.rule_id = null;
    if (body.exclude_from_pnl === undefined && defaultExclude(newBucket)) {
      patch.exclude_from_pnl = true;
    }
  }
  if (typeof body.subcategory === 'string') patch.subcategory = body.subcategory.trim() || null;
  if (typeof body.exclude_from_pnl === 'boolean') patch.exclude_from_pnl = body.exclude_from_pnl;

  let createdRule: Record<string, unknown> | null = null;
  let appliedMatching = 0;

  const createRule = body.create_rule === true && newBucket && newBucket !== 'uncategorized';
  if (createRule) {
    const matchValue =
      (typeof body.rule_match_value === 'string' && body.rule_match_value.trim()) ||
      suggestRuleNeedle(
        typeof body.merchant_raw === 'string' ? body.merchant_raw : existing.merchant_raw,
      );
    if (!matchValue) {
      return NextResponse.json({ error: 'rule_match_value required to create a rule' }, { status: 400 });
    }
    const sub =
      typeof body.subcategory === 'string'
        ? body.subcategory.trim() || null
        : (existing.subcategory as string | null);
    const exclude =
      typeof body.exclude_from_pnl === 'boolean'
        ? body.exclude_from_pnl
        : defaultExclude(newBucket!);
    const ruleName =
      (typeof body.rule_name === 'string' && body.rule_name.trim()) ||
      `${matchValue} → ${newBucket}`;

    const { data: rule, error: ruleErr } = await ctx.service
      .from('expense_category_rules')
      .insert({
        name: ruleName,
        match_type: 'merchant_contains',
        match_value: matchValue,
        amount_min: null,
        amount_max: null,
        ceo_bucket: newBucket,
        subcategory: sub,
        exclude_from_pnl: exclude,
        priority: 25,
        active: true,
        notes: 'Created from Pending review',
        updated_at: new Date().toISOString(),
      })
      .select(
        'id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, exclude_from_pnl, priority, active, notes',
      )
      .single();
    if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });
    createdRule = rule;
    patch.rule_id = rule.id;
    patch.categorized_by = 'user';

    if (body.apply_to_matching === true) {
      const { data: pending } = await ctx.service
        .from('business_expenses')
        .select(FIELDS)
        .eq('ceo_bucket', 'uncategorized')
        .neq('id', id)
        .limit(2000);
      const rules = [rule as ExpenseCategoryRule];
      const now = new Date().toISOString();
      for (const row of pending ?? []) {
        const match = applyExpenseRules(
          {
            merchant_raw: row.merchant_raw,
            memo: row.memo,
            amount: Number(row.amount),
          },
          rules,
        );
        if (match.ceo_bucket === 'uncategorized') continue;
        const { error: upErr } = await ctx.service
          .from('business_expenses')
          .update({
            ceo_bucket: match.ceo_bucket,
            subcategory: match.subcategory ?? sub,
            exclude_from_pnl: match.exclude_from_pnl,
            categorized_by: 'rule',
            rule_id: rule.id,
            updated_at: now,
          })
          .eq('id', row.id);
        if (!upErr) appliedMatching += 1;
      }
    }
  }

  const { data, error } = await ctx.service
    .from('business_expenses')
    .update(patch)
    .eq('id', id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    expense: data,
    rule: createdRule,
    applied_matching: appliedMatching,
  });
}

// DELETE /api/expenses/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await ctx.service.from('business_expenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
