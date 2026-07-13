import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { rollupExpenseMonths } from '@/lib/expense-rollup';

// POST /api/expenses/rollup  body: { month: "YYYY-MM" } or { months: ["YYYY-MM", ...] }
// Manual refresh still available; ledger writes also auto-rollup.
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const months: string[] = [];
  if (typeof body.month === 'string') months.push(body.month);
  if (Array.isArray(body.months)) {
    for (const m of body.months) if (typeof m === 'string') months.push(m);
  }
  if (months.length === 0) {
    const now = new Date();
    months.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }

  for (const m of months) {
    if (!/^\d{4}-\d{2}$/.test(m)) {
      return NextResponse.json({ error: `Invalid month: ${m}` }, { status: 400 });
    }
  }

  try {
    const results = await rollupExpenseMonths(ctx.service, months, ctx.userId);
    return NextResponse.json({ rollups: results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to write business_metrics' },
      { status: 500 },
    );
  }
}
