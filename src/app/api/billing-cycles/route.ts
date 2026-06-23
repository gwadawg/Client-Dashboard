import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import {
  computeObjectionDeadline,
  computePerformanceAmount,
  deriveCycleStatus,
  isPerformanceBilling,
  normalizeBillingModel,
} from '@/lib/billing-model';
import { canViewClientRevenue } from '@/lib/client-revenue-access';

const CYCLE_FIELDS =
  'id, client_id, period_start, period_end, base_amount, show_count, bailed_count, pay_per_show, pay_per_bailed, performance_amount, discount, status, report_sent_at, objection_deadline_at, dispute_note, billing_id, note, created_at, updated_at';

const CLIENT_SNAPSHOT =
  'id, name, lifecycle_status, billing_paused, billing_model, mrr, pay_per_show, pay_per_bailed, performance_terms';

type CycleRow = Record<string, unknown>;

function redactCycle(row: CycleRow): CycleRow {
  return {
    ...row,
    base_amount: null,
    pay_per_show: null,
    pay_per_bailed: null,
    performance_amount: null,
    discount: null,
  };
}

function enrichCycle(row: CycleRow, now = new Date()) {
  const effectiveStatus = deriveCycleStatus(
    {
      status: String(row.status),
      report_sent_at: row.report_sent_at as string | null,
      objection_deadline_at: row.objection_deadline_at as string | null,
    },
    now,
  );
  return { ...row, effective_status: effectiveStatus };
}

/** Promote cycles past the objection deadline to ready_to_bill in the DB. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function promoteReadyCycles(service: any) {
  const nowIso = new Date().toISOString();
  await service
    .from('client_billing_cycles')
    .update({ status: 'ready_to_bill', updated_at: nowIso })
    .eq('status', 'report_sent')
    .lte('objection_deadline_at', nowIso);
}

// GET /api/billing-cycles — list performance billing cycles (+ client snapshot)
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;

  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);
  const params = new URL(req.url).searchParams;
  const clientId = params.get('client_id');
  const status = params.get('status');

  await promoteReadyCycles(ctx.service);

  let query = ctx.service
    .from('client_billing_cycles')
    .select(`${CYCLE_FIELDS}, clients (${CLIENT_SNAPSHOT})`)
    .neq('status', 'voided')
    .order('period_end', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const cycles = (data ?? []).map(row => {
    const raw = row as Record<string, unknown> & { clients: Record<string, unknown> | Record<string, unknown>[] | null };
    const clientSnap = Array.isArray(raw.clients) ? raw.clients[0] ?? null : raw.clients;
    const { clients: _c, ...cycle } = raw;
    const enriched = enrichCycle(cycle as CycleRow, now);
    if (!includeRevenue) {
      return {
        ...enriched,
        ...redactCycle(enriched),
        client: clientSnap
          ? { ...clientSnap, mrr: null, pay_per_show: null, pay_per_bailed: null }
          : null,
      };
    }
    return { ...enriched, client: clientSnap };
  });

  return NextResponse.json({ cycles, can_view_revenue: includeRevenue });
}

// POST /api/billing-cycles — create a draft performance cycle
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const body = await req.json();
  const { client_id, period_start, period_end } = body;
  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  if (!period_start || !period_end) {
    return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 });
  }

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id, billing_model, mrr, pay_per_show, pay_per_bailed, lifecycle_status, billing_paused')
    .eq('id', client_id)
    .single();
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 404 });
  if (!isPerformanceBilling(client.billing_model)) {
    return NextResponse.json({ error: 'Client is not on performance billing' }, { status: 400 });
  }

  const showCount = Math.max(0, Number(body.show_count) || 0);
  const bailedCount = Math.max(0, Number(body.bailed_count) || 0);
  const payPerShow = Number(body.pay_per_show ?? client.pay_per_show) || 0;
  const payPerBailed = Number(body.pay_per_bailed ?? client.pay_per_bailed) || 0;
  const baseAmount = Number(body.base_amount ?? client.mrr) || 0;
  const discount = Number(body.discount) || 0;
  const performanceAmount = computePerformanceAmount(
    { show_count: showCount, bailed_count: bailedCount },
    { pay_per_show: payPerShow, pay_per_bailed: payPerBailed },
  );

  const insert = {
    client_id,
    period_start,
    period_end,
    base_amount: baseAmount,
    show_count: showCount,
    bailed_count: bailedCount,
    pay_per_show: payPerShow,
    pay_per_bailed: payPerBailed,
    performance_amount: performanceAmount,
    discount,
    status: 'draft',
    note: body.note || null,
    created_by: ctx.userId,
  };

  const { data, error } = await ctx.service
    .from('client_billing_cycles')
    .insert(insert)
    .select(CYCLE_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cycle: enrichCycle(data as CycleRow) });
}
