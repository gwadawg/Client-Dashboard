import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import {
  canViewClientRevenue,
  redactBillingRows,
  redactClientMoneyFields,
} from '@/lib/client-revenue-access';

const FILE_CLIENT_FIELDS =
  'id, name, is_live, reporting_type, lifecycle_status, client_stage, mrr, billing_type, billing_day, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, performance_terms, billing_email, primary_contact, primary_contact_name, email, phone, source, website, brokerage_name, nmls, state, timezone, created_at, churned_at';

const FILE_BILLING_FIELDS =
  'id, billed_on, due_date, period_start, period_end, amount, base_amount, performance_amount, late_fee, discount, passthrough_amount, amount_paid, status, paid_on, method, invoice_ref, note, revenue_type, revenue_segment, lead_source, term_months, processing_fee, created_at';

// GET /api/clients/[id] — the client "file": the full client record plus its
// complete billing/revenue history. Structured so more sections (success
// reports, KPI history, notes) can be added over time.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;

  const [clientRes, billingsRes] = await Promise.all([
    ctx.service.from('clients').select(FILE_CLIENT_FIELDS).eq('id', id).single(),
    ctx.service
      .from('client_billings')
      .select(FILE_BILLING_FIELDS)
      .eq('client_id', id)
      .order('billed_on', { ascending: false }),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }
  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 500 });

  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);
  const client = includeRevenue ? clientRes.data : redactClientMoneyFields(clientRes.data);
  const billings = includeRevenue ? (billingsRes.data ?? []) : redactBillingRows(billingsRes.data);

  return NextResponse.json({
    client,
    billings,
    can_view_revenue: includeRevenue,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  // Editable from both the Client Roster and the Client Billing tabs.
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);
  const revenueFields = new Set(['mrr', 'daily_adspend']);
  if (!includeRevenue && Object.keys(body).some(k => revenueFields.has(k))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const allowed = [
    'name', 'is_live', 'reporting_type',
    // Billing fields (editable from the Client Billing tab)
    'mrr', 'billing_type', 'billing_day', 'launch_date', 'date_signed', 'contract_end_date', 'contract_term_months', 'daily_adspend',
    // Lifecycle (pause/churn/reactivate) + performance pricing note.
    // churned_at is intentionally NOT here — the DB trigger owns it.
    'lifecycle_status', 'performance_terms',
    // Identity / contact (Client Roster manager)
    'email', 'billing_email', 'primary_contact', 'primary_contact_name', 'ghl_location_id',
    // Per-client KPI band overrides (Client Success benchmark editor)
    'kpi_benchmarks',
  ];
  const numericFields = new Set(['mrr', 'contract_term_months', 'daily_adspend', 'billing_day']);
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (!(k in body)) continue;
    if (!includeRevenue && revenueFields.has(k)) continue;
    if (k === 'reporting_type') updates[k] = normalizeReportingType(body[k]);
    else if (k === 'kpi_benchmarks') updates[k] = body[k] ?? null; // object or null, stored as-is
    else if (numericFields.has(k)) updates[k] = body[k] === '' || body[k] === null ? null : Number(body[k]);
    else updates[k] = body[k] === '' ? null : body[k];
  }

  // Keep email and billing_email identical — roster edits one field, both columns update.
  if ('email' in body || 'billing_email' in body) {
    const raw = 'email' in body ? body.email : body.billing_email;
    const synced = raw === '' || raw == null ? null : raw;
    updates.email = synced;
    updates.billing_email = synced;
  }
  // Prefer primary_contact_name; mirror to legacy primary_contact for older readers.
  if ('primary_contact_name' in body) {
    updates.primary_contact = updates.primary_contact_name ?? null;
  } else if ('primary_contact' in body) {
    updates.primary_contact_name = updates.primary_contact ?? null;
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
    .select('id, name, is_live, reporting_type, share_token, created_at, mrr, billing_type, billing_day, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, lifecycle_status, performance_terms, email, billing_email, primary_contact, primary_contact_name, kpi_benchmarks, kpi_benchmarks_updated_at, kpi_benchmarks_updated_by, kpi_benchmarks_note, clickup_task_id, ghl_location_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const client = includeRevenue ? data : redactClientMoneyFields(data);
  return NextResponse.json({ client });
}
