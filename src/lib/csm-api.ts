import { NextResponse } from 'next/server';
import type { AuthContext } from './api-auth';
import { hasPermission } from './permissions';
import type { DataChatFilters } from './ai/data-chat';

/** Hard exclusions for every CSM API response. */
export const CSM_API_EXCLUSIONS = [
  'mrr',
  'invoices',
  'stripe',
  'client_billing_totals',
  'view_client_revenue',
  'expenses',
  'amex',
  'cac_cogs_ledger',
  'owner_pnl',
  'ceo_dashboard',
  'retainers',
  'payroll_run_totals', // posted pay amounts — rates come from pay-structures instead
] as const;

export function csmDefaultRange(): { start_date: string; end_date: string } {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start_date: iso(start), end_date: iso(end) };
}

export function parseCsmRange(req: { nextUrl: { searchParams: URLSearchParams } }): DataChatFilters {
  const defaults = csmDefaultRange();
  const start_date = req.nextUrl.searchParams.get('start_date')?.trim() || defaults.start_date;
  const end_date = req.nextUrl.searchParams.get('end_date')?.trim() || defaults.end_date;
  const client_id = req.nextUrl.searchParams.get('clientId')?.trim() || null;
  const live_only = req.nextUrl.searchParams.get('live_only') === '1';
  return { start_date, end_date, client_id, live_only: !client_id && live_only };
}

/**
 * CSM Cursor API seat: client_health is the primary gate.
 * Broader tools (dials/calls) are composed in routes; revenue/CEO/expenses stay out of payloads.
 */
export function requireCsmApiAccess(ctx: AuthContext): NextResponse | null {
  const subject = {
    isOwner: ctx.isOwner,
    allowedPermissions: ctx.allowedPermissions,
  };
  if (hasPermission('client_health', subject) || hasPermission('admin_clients', subject)) {
    return null;
  }
  return NextResponse.json(
    {
      error: 'Forbidden',
      detail: 'Needs client_health or admin_clients for CSM API',
    },
    { status: 403 },
  );
}

/** Agent pay STRUCTURE fields only — not payroll_run payouts. */
export const CSM_PAY_STRUCTURE_SELECT =
  'id, name, email, phone, pay_type, active, ended_on, base_salary, monthly_bonus, base_salary_prorate_days, pay_per_booking, pay_per_show, pay_per_live_transfer, pay_per_qualified_demo, pay_per_close';
