import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { normalizeReportingType } from '@/lib/kpi-layouts';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  // Editable from both the Client Roster and the Client Billing tabs.
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const allowed = [
    'name', 'is_live', 'reporting_type',
    // Billing fields (editable from the Client Billing tab)
    'mrr', 'billing_type', 'launch_date', 'date_signed', 'contract_end_date', 'contract_term_months', 'daily_adspend',
    // Lifecycle (pause/churn/reactivate) + performance pricing note.
    // churned_at is intentionally NOT here — the DB trigger owns it.
    'lifecycle_status', 'performance_terms',
  ];
  const numericFields = new Set(['mrr', 'contract_term_months', 'daily_adspend']);
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (!(k in body)) continue;
    if (k === 'reporting_type') updates[k] = normalizeReportingType(body[k]);
    else if (numericFields.has(k)) updates[k] = body[k] === '' || body[k] === null ? null : Number(body[k]);
    else updates[k] = body[k] === '' ? null : body[k];
  }

  const { data, error } = await ctx.service
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select('id, name, is_live, reporting_type, share_token, created_at, mrr, billing_type, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, lifecycle_status, performance_terms')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
