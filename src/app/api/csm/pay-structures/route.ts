import { NextRequest, NextResponse } from 'next/server';
import { assertCsmAuth, getCsmAuthContext } from '@/lib/csm-auth';
import {
  CSM_API_EXCLUSIONS,
  CSM_PAY_STRUCTURE_SELECT,
  requireCsmApiAccess,
} from '@/lib/csm-api';
import { normalizeEmployeePosition, POSITION_LABELS } from '@/lib/employee-positions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/csm/pay-structures?active=1
 *
 * Team pay STRUCTURES (rates / plan type) for payroll processing help.
 * Does NOT return payroll_run payout totals, bank info, or expense ledger.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCsmAuthContext(req);
  if (!assertCsmAuth(ctx)) return ctx;

  const denied = requireCsmApiAccess(ctx);
  if (denied) return denied;

  const activeOnly = req.nextUrl.searchParams.get('active') !== '0';

  let q = ctx.service
    .from('agents')
    .select(CSM_PAY_STRUCTURE_SELECT)
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('active', true);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const structures = (data || []).map(row => {
    const pay_type = normalizeEmployeePosition(row.pay_type);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      pay_type,
      pay_type_label: POSITION_LABELS[pay_type] ?? pay_type,
      active: row.active,
      ended_on: row.ended_on,
      rates: {
        base_salary: row.base_salary,
        monthly_bonus: row.monthly_bonus,
        base_salary_prorate_days: row.base_salary_prorate_days,
        pay_per_booking: row.pay_per_booking,
        pay_per_show: row.pay_per_show,
        pay_per_live_transfer: row.pay_per_live_transfer,
        pay_per_qualified_demo: row.pay_per_qualified_demo,
        pay_per_close: row.pay_per_close,
      },
    };
  });

  return NextResponse.json({
    active_only: activeOnly,
    count: structures.length,
    structures,
    exclusions: [...CSM_API_EXCLUSIONS],
    note: 'Rates/plan only. Posted payroll run totals and company expense ledger are blocked.',
  });
}
