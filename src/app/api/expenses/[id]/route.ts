import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import {
  applyExpenseRules,
  isAcquisitionCostChannel,
  isCeoBucket,
  isFulfillmentLine,
  normalizeMerchant,
  resolveAcquisitionCostChannel,
  suggestRuleNeedle,
  type AcquisitionCostChannel,
  type CeoBucket,
  type ExpenseCategoryRule,
  type FulfillmentLine,
} from '@/lib/expenses';
import { rollupExpenseDates, uniqueMonthsFromDates } from '@/lib/expense-rollup';

const FIELDS =
  'id, occurred_on, amount, currency, account_id, source, merchant_raw, merchant_normalized, memo, external_id, ceo_bucket, subcategory, fulfillment_line, acquisition_cost_channel, exclude_from_pnl, categorized_by, rule_id, payroll_run_id, client_id, created_at, updated_at';

const RULE_FIELDS =
  'id, name, match_type, match_value, amount_min, amount_max, ceo_bucket, subcategory, fulfillment_line, acquisition_cost_channel, exclude_from_pnl, priority, active, notes';

type Ctx = Exclude<Awaited<ReturnType<typeof getAuthContext>>, NextResponse>;

async function loadExpense(ctx: Ctx, id: string) {
  return ctx.service.from('business_expenses').select(FIELDS).eq('id', id).maybeSingle();
}

function defaultExclude(bucket: CeoBucket): boolean {
  return bucket === 'personal' || bucket === 'owner_draw' || bucket === 'passthrough';
}

/**
 * Apply one rule to every ledger row whose merchant matches (history + current).
 * Uses normalized merchant contains / equals — not raw ilike alone.
 */
async function applyRuleToMatchingExpenses(
  ctx: Ctx,
  rule: ExpenseCategoryRule,
  opts: { skipId?: string; onlyUncategorized?: boolean } = {},
): Promise<{ applied: number; months: string[] }> {
  const needle = rule.match_value.toLowerCase().trim();
  if (!needle) return { applied: 0, months: [] };

  // Broad fetch, then precise match via applyExpenseRules
  let query = ctx.service
    .from('business_expenses')
    .select(FIELDS)
    .limit(5000);
  if (opts.skipId) query = query.neq('id', opts.skipId);
  if (opts.onlyUncategorized) query = query.eq('ceo_bucket', 'uncategorized');

  // Prefer SQL prefilter when possible
  if (rule.match_type === 'merchant_contains' || rule.match_type === 'merchant_equals') {
    query = query.ilike('merchant_raw', `%${needle.replace(/[%_]/g, '')}%`);
  }

  const { data: candidates, error } = await query;
  if (error) throw new Error(error.message);

  const rules = [rule];
  const now = new Date().toISOString();
  let applied = 0;
  const touchedDates: string[] = [];

  for (const row of candidates ?? []) {
    const match = applyExpenseRules(
      {
        merchant_raw: row.merchant_raw,
        memo: row.memo,
        amount: Number(row.amount),
      },
      rules,
    );
    if (match.ceo_bucket === 'uncategorized') continue;

    const nextLine =
      match.ceo_bucket === 'fulfillment'
        ? (match.fulfillment_line ?? rule.fulfillment_line ?? null)
        : null;
    const nextChannel =
      match.ceo_bucket === 'cac'
        ? (match.acquisition_cost_channel ??
          resolveAcquisitionCostChannel({
            ceo_bucket: 'cac',
            subcategory: match.subcategory ?? rule.subcategory,
            merchant_raw: row.merchant_raw,
            merchant_normalized: row.merchant_normalized,
            source: row.source,
          }))
        : null;

    // Skip no-op updates
    if (
      row.ceo_bucket === match.ceo_bucket &&
      (row.subcategory ?? null) === (match.subcategory ?? rule.subcategory ?? null) &&
      (row.fulfillment_line ?? null) === nextLine &&
      (row.acquisition_cost_channel ?? null) === (nextChannel ?? null) &&
      !!row.exclude_from_pnl === !!match.exclude_from_pnl &&
      row.rule_id === rule.id
    ) {
      continue;
    }

    const { error: upErr } = await ctx.service
      .from('business_expenses')
      .update({
        ceo_bucket: match.ceo_bucket,
        subcategory: match.subcategory ?? rule.subcategory,
        fulfillment_line: nextLine,
        acquisition_cost_channel: nextChannel,
        exclude_from_pnl: match.exclude_from_pnl,
        categorized_by: 'rule',
        rule_id: rule.id,
        updated_at: now,
      })
      .eq('id', row.id);
    if (!upErr) {
      applied += 1;
      if (typeof row.occurred_on === 'string') touchedDates.push(row.occurred_on);
    }
  }
  return { applied, months: uniqueMonthsFromDates(touchedDates) };
}

/** Upsert a merchant_contains rule by match_value (reuse existing instead of stacking dupes). */
async function upsertMerchantRule(
  ctx: Ctx,
  input: {
    name: string;
    matchValue: string;
    ceoBucket: CeoBucket;
    subcategory: string | null;
    fulfillmentLine: FulfillmentLine | null;
    acquisitionCostChannel: AcquisitionCostChannel | null;
    excludeFromPnl: boolean;
  },
): Promise<ExpenseCategoryRule> {
  const matchValue = input.matchValue.trim();
  const fulfillmentLine =
    input.ceoBucket === 'fulfillment' ? input.fulfillmentLine : null;
  const acquisitionCostChannel =
    input.ceoBucket === 'cac' ? input.acquisitionCostChannel : null;
  const { data: existing } = await ctx.service
    .from('expense_category_rules')
    .select(RULE_FIELDS)
    .eq('match_type', 'merchant_contains')
    .ilike('match_value', matchValue)
    .eq('active', true)
    .order('priority')
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await ctx.service
      .from('expense_category_rules')
      .update({
        name: input.name,
        ceo_bucket: input.ceoBucket,
        subcategory: input.subcategory,
        fulfillment_line: fulfillmentLine,
        acquisition_cost_channel: acquisitionCostChannel,
        exclude_from_pnl: input.excludeFromPnl,
        match_value: matchValue,
        match_type: 'merchant_contains',
        active: true,
        priority: Math.min(Number(existing.priority) || 25, 25),
        notes: existing.notes ?? 'Updated from Map charge',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(RULE_FIELDS)
      .single();
    if (error) throw new Error(error.message);
    return updated as ExpenseCategoryRule;
  }

  const { data: created, error } = await ctx.service
    .from('expense_category_rules')
    .insert({
      name: input.name,
      match_type: 'merchant_contains',
      match_value: matchValue,
      amount_min: null,
      amount_max: null,
      ceo_bucket: input.ceoBucket,
      subcategory: input.subcategory,
      fulfillment_line: fulfillmentLine,
      acquisition_cost_channel: acquisitionCostChannel,
      exclude_from_pnl: input.excludeFromPnl,
      priority: 25,
      active: true,
      notes: 'Created from Map charge',
      updated_at: new Date().toISOString(),
    })
    .select(RULE_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return created as ExpenseCategoryRule;
}

// PATCH /api/expenses/[id] — recategorize / edit / optionally create rule + apply to all history
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

  const effectiveBucket = (newBucket ?? existing.ceo_bucket) as CeoBucket;

  if (typeof body.subcategory === 'string') patch.subcategory = body.subcategory.trim() || null;

  if (body.fulfillment_line === null || body.fulfillment_line === '') {
    patch.fulfillment_line = null;
  } else if (isFulfillmentLine(body.fulfillment_line)) {
    patch.fulfillment_line = body.fulfillment_line;
  }

  // COGS line only applies to fulfillment; clear when leaving that bucket
  if (effectiveBucket !== 'fulfillment') {
    patch.fulfillment_line = null;
  }

  let acquisitionChannel: AcquisitionCostChannel | null = null;
  if (body.acquisition_cost_channel === null || body.acquisition_cost_channel === '') {
    acquisitionChannel = null;
  } else if (isAcquisitionCostChannel(body.acquisition_cost_channel)) {
    acquisitionChannel = body.acquisition_cost_channel;
  }

  if (effectiveBucket === 'cac') {
    const merchantForResolve =
      typeof body.merchant_raw === 'string'
        ? body.merchant_raw
        : (existing.merchant_raw as string | null);
    const subForResolve =
      typeof body.subcategory === 'string'
        ? body.subcategory.trim() || null
        : (existing.subcategory as string | null);
    acquisitionChannel =
      acquisitionChannel ??
      resolveAcquisitionCostChannel({
        ceo_bucket: 'cac',
        acquisition_cost_channel: existing.acquisition_cost_channel as string | null,
        subcategory: subForResolve,
        merchant_raw: merchantForResolve,
        merchant_normalized: existing.merchant_normalized as string | null,
        source: existing.source as string | null,
      });
    patch.acquisition_cost_channel = acquisitionChannel;
    if (
      acquisitionChannel === 'meta_media' &&
      body.exclude_from_pnl === undefined &&
      patch.exclude_from_pnl === undefined
    ) {
      patch.exclude_from_pnl = true;
    }
  } else {
    patch.acquisition_cost_channel = null;
  }

  if (typeof body.exclude_from_pnl === 'boolean') patch.exclude_from_pnl = body.exclude_from_pnl;

  let createdRule: ExpenseCategoryRule | null = null;
  let appliedMatching = 0;
  const ruleMonths: string[] = [];

  // Default: save rule + apply to all history whenever mapping a bucket
  const wantsRule =
    body.create_rule !== false &&
    newBucket != null &&
    newBucket !== 'uncategorized';
  const wantsApply = body.apply_to_matching !== false;

  if (wantsRule) {
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
    let fulfillmentLine: FulfillmentLine | null = null;
    if (newBucket === 'fulfillment') {
      if (isFulfillmentLine(body.fulfillment_line)) {
        fulfillmentLine = body.fulfillment_line;
      } else if (isFulfillmentLine(existing.fulfillment_line)) {
        fulfillmentLine = existing.fulfillment_line as FulfillmentLine;
      } else {
        return NextResponse.json(
          {
            error:
              'fulfillment_line required for Fulfillment / COGS (media_buying, call_center, client_success, delivery_tech)',
          },
          { status: 400 },
        );
      }
      patch.fulfillment_line = fulfillmentLine;
    }
    const exclude =
      typeof body.exclude_from_pnl === 'boolean'
        ? body.exclude_from_pnl
        : defaultExclude(newBucket!);
    const ruleName =
      (typeof body.rule_name === 'string' && body.rule_name.trim()) ||
      `${matchValue} → ${newBucket}`;

    try {
      createdRule = await upsertMerchantRule(ctx, {
        name: ruleName,
        matchValue,
        ceoBucket: newBucket!,
        subcategory: sub,
        fulfillmentLine,
        acquisitionCostChannel: effectiveBucket === 'cac' ? acquisitionChannel : null,
        excludeFromPnl: exclude,
      });
      patch.rule_id = createdRule.id;
      patch.categorized_by = 'user';

      if (wantsApply) {
        const applied = await applyRuleToMatchingExpenses(ctx, createdRule, { skipId: id });
        appliedMatching = applied.applied;
        ruleMonths.push(...applied.months);
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to save/apply rule' },
        { status: 500 },
      );
    }
  }

  const { data, error } = await ctx.service
    .from('business_expenses')
    .update(patch)
    .eq('id', id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rollups = null;
  try {
    rollups = await rollupExpenseDates(
      ctx.service,
      [existing.occurred_on as string, data.occurred_on as string, ...ruleMonths],
      ctx.userId,
    );
  } catch (e) {
    return NextResponse.json({
      expense: data,
      rule: createdRule,
      applied_matching: appliedMatching,
      warning: e instanceof Error ? e.message : 'Expense updated but KPI rollup failed',
    });
  }

  return NextResponse.json({
    expense: data,
    rule: createdRule,
    applied_matching: appliedMatching,
    rollups,
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

  const { data: existing, error: findErr } = await loadExpense(ctx, id);
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await ctx.service.from('business_expenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rollups = null;
  try {
    rollups = await rollupExpenseDates(ctx.service, [existing.occurred_on as string], ctx.userId);
  } catch (e) {
    return NextResponse.json({
      deleted: true,
      warning: e instanceof Error ? e.message : 'Expense deleted but KPI rollup failed',
    });
  }

  return NextResponse.json({ deleted: true, rollups });
}
