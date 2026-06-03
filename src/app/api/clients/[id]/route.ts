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
    'mrr', 'billing_type', 'billing_day', 'launch_date', 'date_signed', 'contract_end_date', 'contract_term_months', 'daily_adspend',
    // Lifecycle (pause/churn/reactivate) + performance pricing note.
    // churned_at is intentionally NOT here — the DB trigger owns it.
    'lifecycle_status', 'performance_terms',
    // Identity / contact (Client Roster manager)
    'billing_email', 'primary_contact',
    // Per-client KPI band overrides (Client Success benchmark editor)
    'kpi_benchmarks',
  ];
  const numericFields = new Set(['mrr', 'contract_term_months', 'daily_adspend', 'billing_day']);
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (!(k in body)) continue;
    if (k === 'reporting_type') updates[k] = normalizeReportingType(body[k]);
    else if (k === 'kpi_benchmarks') updates[k] = body[k] ?? null; // object or null, stored as-is
    else if (numericFields.has(k)) updates[k] = body[k] === '' || body[k] === null ? null : Number(body[k]);
    else updates[k] = body[k] === '' ? null : body[k];
  }

  // Governance stamp for the per-client KPI benchmark overrides: whenever the bands
  // change, record who/when/why so a per-client bar can't silently rot to green (a
  // >90d staleness flag in the Client Roster reads kpi_benchmarks_updated_at). On reset
  // (kpi_benchmarks = null) the governance fields clear with it.
  if ('kpi_benchmarks' in body) {
    if (updates.kpi_benchmarks == null) {
      updates.kpi_benchmarks_updated_at = null;
      updates.kpi_benchmarks_updated_by = null;
      updates.kpi_benchmarks_note = null;
    } else {
      updates.kpi_benchmarks_updated_at = new Date().toISOString();
      updates.kpi_benchmarks_updated_by = ctx.userId;
      const note = typeof body.kpi_benchmarks_note === 'string' ? body.kpi_benchmarks_note.trim() : '';
      updates.kpi_benchmarks_note = note || null;
    }
  }

  const { data, error } = await ctx.service
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select('id, name, is_live, reporting_type, share_token, created_at, mrr, billing_type, billing_day, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, lifecycle_status, performance_terms, billing_email, primary_contact, kpi_benchmarks, kpi_benchmarks_updated_at, kpi_benchmarks_updated_by, kpi_benchmarks_note')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
