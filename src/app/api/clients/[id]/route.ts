import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
import { CLIENT_CALL_FIELDS } from '@/lib/client-calls';
import {
  isValidReasonCode,
  requiresReasonOnChurn,
} from '@/lib/client-feedback';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { normalizeStatesLicensed } from '@/lib/us-states';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import {
  canViewClientRevenue,
  redactBillingRows,
  redactClientMoneyFields,
} from '@/lib/client-revenue-access';
import { resolveUserLabels } from '@/lib/user-resolver';

const STATUS_HISTORY_FIELDS =
  'id, previous_status, new_status, reason_code, note, mrr_at_change, changed_at, changed_by, source, related_call_id';

const CLIENT_NOTES_FIELDS =
  'id, note_type, reason_code, body, created_at, created_by, updated_at, related_call_id';

const FILE_CLIENT_FIELDS =
  'id, name, is_live, reporting_type, lifecycle_status, client_stage, mrr, billing_type, billing_day, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, performance_terms, billing_email, primary_contact, primary_contact_name, email, phone, source, website, brokerage_name, nmls, state, states_licensed, timezone, created_at, churned_at';

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

  const [clientRes, billingsRes, historyRes, notesRes, callsRes] = await Promise.all([
    ctx.service.from('clients').select(FILE_CLIENT_FIELDS).eq('id', id).single(),
    ctx.service
      .from('client_billings')
      .select(FILE_BILLING_FIELDS)
      .neq('status', VOIDED_BILLING_STATUS)
      .eq('client_id', id)
      .order('billed_on', { ascending: false }),
    ctx.service
      .from('client_status_history')
      .select(STATUS_HISTORY_FIELDS)
      .eq('client_id', id)
      .order('changed_at', { ascending: false }),
    ctx.service
      .from('client_notes')
      .select(CLIENT_NOTES_FIELDS)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    ctx.service
      .from('client_calls')
      .select(CLIENT_CALL_FIELDS)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('called_at', { ascending: false }),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }
  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 500 });
  if (historyRes.error) return NextResponse.json({ error: historyRes.error.message }, { status: 500 });
  if (notesRes.error) return NextResponse.json({ error: notesRes.error.message }, { status: 500 });
  if (callsRes.error) return NextResponse.json({ error: callsRes.error.message }, { status: 500 });

  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);
  const client = includeRevenue ? clientRes.data : redactClientMoneyFields(clientRes.data);
  const billings = includeRevenue ? (billingsRes.data ?? []) : redactBillingRows(billingsRes.data);
  const statusHistory = historyRes.data ?? [];
  const notes = notesRes.data ?? [];
  const calls = callsRes.data ?? [];

  const authorIds = [
    ...notes.map((n: { created_by?: string | null }) => n.created_by),
    ...calls.map((c: { created_by?: string | null }) => c.created_by),
  ];
  const authorLabels = await resolveUserLabels(ctx.service, authorIds);

  return NextResponse.json({
    client,
    billings,
    status_history: statusHistory,
    notes: notes.map((n: { created_by?: string | null }) => ({
      ...n,
      created_by_label: n.created_by ? authorLabels[n.created_by] ?? null : null,
    })),
    calls: calls.map((c: { created_by?: string | null }) => ({
      ...c,
      created_by_label: c.created_by ? authorLabels[c.created_by] ?? null : null,
    })),
    author_labels: authorLabels,
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
    // Identity / contact (Client Roster + Client File editor)
    'email', 'billing_email', 'primary_contact', 'primary_contact_name', 'ghl_location_id',
    'phone', 'source', 'website', 'brokerage_name', 'nmls', 'state', 'states_licensed', 'timezone',
    // Per-client KPI band overrides (Client Success benchmark editor)
    'kpi_benchmarks',
  ];
  const numericFields = new Set(['mrr', 'contract_term_months', 'daily_adspend', 'billing_day']);
  const updates: Record<string, unknown> = {};
  if ('states_licensed' in body) {
    updates.states_licensed = normalizeStatesLicensed(body.states_licensed);
  }
  for (const k of allowed) {
    if (!(k in body)) continue;
    if (k === 'states_licensed') continue;
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

  const newLifecycle =
    typeof body.lifecycle_status === 'string' ? body.lifecycle_status : null;
  const statusChangeReason =
    typeof body.status_change_reason === 'string' && body.status_change_reason.trim()
      ? body.status_change_reason.trim()
      : null;
  const statusChangeNote =
    typeof body.status_change_note === 'string' && body.status_change_note.trim()
      ? body.status_change_note.trim()
      : null;

  if (newLifecycle && requiresReasonOnChurn(newLifecycle)) {
    if (!statusChangeReason || !isValidReasonCode(statusChangeReason)) {
      return NextResponse.json(
        { error: 'A churn reason is required when marking a client as churned' },
        { status: 400 },
      );
    }
  }
  if (statusChangeReason && !isValidReasonCode(statusChangeReason)) {
    return NextResponse.json({ error: 'Invalid status_change_reason' }, { status: 400 });
  }

  // Capture prior row for lifecycle match + MRR history.
  let previousLifecycle: string | null = null;
  let previousMrr: number | null = null;
  const { data: priorRow, error: priorErr } = await ctx.service
    .from('clients')
    .select('lifecycle_status, mrr, is_live')
    .eq('id', id)
    .single();
  if (priorErr) return NextResponse.json({ error: priorErr.message }, { status: 500 });
  previousLifecycle = priorRow.lifecycle_status ?? null;
  previousMrr = priorRow.mrr ?? null;

  if (newLifecycle) {
    const syncedLive = syncIsLiveWithLifecycle(
      newLifecycle,
      'is_live' in body ? Boolean(body.is_live) : undefined,
    );
    if (syncedLive !== undefined) updates.is_live = syncedLive;
  }

  const relatedCallId =
    typeof body.related_call_id === 'string' && body.related_call_id.trim()
      ? body.related_call_id.trim()
      : null;

  const { data, error } = await ctx.service
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select(FILE_CLIENT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich the trigger-created history row when lifecycle changes with feedback.
  if (newLifecycle && previousLifecycle !== newLifecycle) {
    const { data: historyRows, error: historyError } = await ctx.service
      .from('client_status_history')
      .select('id')
      .eq('client_id', id)
      .eq('previous_status', previousLifecycle)
      .eq('new_status', newLifecycle)
      .eq('source', 'trigger')
      .order('changed_at', { ascending: false })
      .limit(1);

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 });
    }

    const historyId = historyRows?.[0]?.id;
    if (historyId && (statusChangeReason || statusChangeNote || relatedCallId)) {
      const historyUpdate: Record<string, unknown> = {
        source: 'manual',
        changed_by: ctx.userId,
      };
      if (statusChangeReason) historyUpdate.reason_code = statusChangeReason;
      if (statusChangeNote) historyUpdate.note = statusChangeNote;
      if (relatedCallId) historyUpdate.related_call_id = relatedCallId;

      const { error: enrichError } = await ctx.service
        .from('client_status_history')
        .update(historyUpdate)
        .eq('id', historyId);

      if (enrichError) {
        return NextResponse.json({ error: enrichError.message }, { status: 500 });
      }

      if (relatedCallId) {
        await ctx.service
          .from('client_calls')
          .update({ status_history_id: historyId })
          .eq('id', relatedCallId)
          .eq('client_id', id);
      }
    }
  }

  if (includeRevenue && 'mrr' in updates && updates.mrr !== previousMrr) {
    await ctx.service.from('client_mrr_history').insert({
      client_id: id,
      previous_mrr: previousMrr,
      new_mrr: updates.mrr as number | null,
      changed_by: ctx.userId,
      note: typeof body.mrr_change_note === 'string' ? body.mrr_change_note.trim() || null : null,
    });
  }

  const client = includeRevenue ? data : redactClientMoneyFields(data);
  return NextResponse.json({ client });
}
