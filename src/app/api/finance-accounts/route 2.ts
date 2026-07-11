import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { ACCOUNT_TYPES, type AccountType } from '@/lib/expenses';

const FIELDS =
  'id, name, institution, account_type, entity, is_business, active, last4, notes, created_at';

// GET /api/finance-accounts
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const { data, error } = await ctx.service
    .from('finance_accounts')
    .select(FIELDS)
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data ?? [] });
}

// POST /api/finance-accounts — create a card/bank account
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const accountType: AccountType =
    typeof body.account_type === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(body.account_type)
      ? (body.account_type as AccountType)
      : 'credit_card';

  const row = {
    name: body.name.trim(),
    institution: typeof body.institution === 'string' ? body.institution.trim() || null : null,
    account_type: accountType,
    entity: typeof body.entity === 'string' ? body.entity.trim() || null : null,
    is_business: body.is_business !== false,
    active: body.active !== false,
    last4: typeof body.last4 === 'string' ? body.last4.trim().slice(-4) || null : null,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    created_by: ctx.userId,
  };

  const { data, error } = await ctx.service.from('finance_accounts').insert(row).select(FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}
