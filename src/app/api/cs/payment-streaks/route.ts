import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { BILLING_LEDGER_FIELDS } from '@/lib/billing-revenue';
import { canViewClientRevenue } from '@/lib/permissions';
import {
  buildClientStreakTimeline,
  isYearMonth,
  type MonthDispositionOverride,
  type StreakBillingRow,
} from '@/lib/payment-streak';

const PERMS = ['client_health', 'admin_clients', 'admin_billing'] as const;

const CLIENT_FIELDS =
  'id, name, lifecycle_status, billing_paused, billing_paused_at, billing_paused_note, churned_at, launch_date, date_signed, mrr, reporting_type, is_live';

type ClientRow = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  billing_paused: boolean | null;
  billing_paused_at: string | null;
  billing_paused_note: string | null;
  churned_at: string | null;
  launch_date: string | null;
  date_signed: string | null;
  mrr: number | null;
  reporting_type: string | null;
  is_live: boolean | null;
};

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...PERMS]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const includePaused = searchParams.get('include_paused') === 'true';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from && !isYearMonth(from)) {
    return NextResponse.json({ error: 'from must be YYYY-MM' }, { status: 400 });
  }
  if (to && !isYearMonth(to)) {
    return NextResponse.json({ error: 'to must be YYYY-MM' }, { status: 400 });
  }

  const canViewRevenue = canViewClientRevenue({
    isOwner: ctx.isOwner,
    allowedPermissions: ctx.allowedPermissions,
  });

  let clientQuery = ctx.service
    .from('clients')
    .select(CLIENT_FIELDS)
    .eq('lifecycle_status', 'active')
    .order('name');

  if (!includePaused) {
    clientQuery = clientQuery.or('billing_paused.is.null,billing_paused.eq.false');
  }

  const { data: clients, error: clientsErr } = await clientQuery;
  if (clientsErr) {
    return NextResponse.json({ error: clientsErr.message }, { status: 500 });
  }

  const list = (clients ?? []) as ClientRow[];
  if (!list.length) {
    return NextResponse.json({
      clients: [],
      months: [],
      can_view_revenue: canViewRevenue,
    });
  }

  const ids = list.map((c) => c.id);

  const [billingsRes, overridesRes] = await Promise.all([
    ctx.service
      .from('client_billings')
      .select(BILLING_LEDGER_FIELDS)
      .in('client_id', ids)
      .order('billed_on', { ascending: true }),
    ctx.service
      .from('client_month_disposition_overrides')
      .select('client_id, year_month, disposition, note')
      .in('client_id', ids),
  ]);

  if (billingsRes.error) {
    return NextResponse.json({ error: billingsRes.error.message }, { status: 500 });
  }
  if (overridesRes.error) {
    // Table may not exist yet pre-migration — surface clearly
    return NextResponse.json(
      {
        error:
          overridesRes.error.message.includes('does not exist') ||
          overridesRes.error.code === '42P01'
            ? 'client_month_disposition_overrides missing — run migration add_client_month_disposition_overrides.sql'
            : overridesRes.error.message,
      },
      { status: 500 },
    );
  }

  const billingsByClient = new Map<string, StreakBillingRow[]>();
  for (const row of billingsRes.data ?? []) {
    const r = row as StreakBillingRow & { client_id: string };
    const arr = billingsByClient.get(r.client_id) ?? [];
    arr.push(r);
    billingsByClient.set(r.client_id, arr);
  }

  const overridesByClient = new Map<string, MonthDispositionOverride[]>();
  for (const row of overridesRes.data ?? []) {
    const r = row as {
      client_id: string;
      year_month: string;
      disposition: MonthDispositionOverride['disposition'];
      note: string | null;
    };
    const arr = overridesByClient.get(r.client_id) ?? [];
    arr.push({
      year_month: r.year_month,
      disposition: r.disposition,
      note: r.note,
    });
    overridesByClient.set(r.client_id, arr);
  }

  // First pass: resolve each client's natural window, then unify columns.
  const draft = list.map((c) =>
    buildClientStreakTimeline({
      client: c,
      billings: billingsByClient.get(c.id) ?? [],
      overrides: overridesByClient.get(c.id) ?? [],
      from: from ?? null,
      to: to ?? null,
    }),
  );

  let globalFrom = from ?? null;
  let globalTo = to ?? null;
  for (const tl of draft) {
    for (const m of tl.months) {
      if (!globalFrom || m.year_month < globalFrom) globalFrom = m.year_month;
      if (!globalTo || m.year_month > globalTo) globalTo = m.year_month;
    }
  }

  const monthSet = new Set<string>();
  const payload = list.map((c, i) => {
    const timeline =
      globalFrom && globalTo
        ? buildClientStreakTimeline({
            client: c,
            billings: billingsByClient.get(c.id) ?? [],
            overrides: overridesByClient.get(c.id) ?? [],
            from: globalFrom,
            to: globalTo,
          })
        : draft[i];
    for (const m of timeline.months) monthSet.add(m.year_month);

    const months = timeline.months.map((m) => {
      if (canViewRevenue) return m;
      return {
        ...m,
        amount: null,
        amount_paid: null,
      };
    });

    return {
      id: c.id,
      name: c.name,
      lifecycle_status: c.lifecycle_status,
      billing_paused: !!c.billing_paused,
      billing_paused_at: c.billing_paused_at,
      churned_at: c.churned_at,
      launch_date: c.launch_date,
      date_signed: c.date_signed,
      reporting_type: c.reporting_type,
      is_live: c.is_live,
      mrr: canViewRevenue ? c.mrr : null,
      first_billable_month: timeline.first_billable_month,
      summary: timeline.summary,
      months,
    };
  });

  const months = [...monthSet].sort();

  return NextResponse.json({
    clients: payload,
    months,
    can_view_revenue: canViewRevenue,
  });
}
