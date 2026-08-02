import type { createServiceClient } from './supabase';
import {
  OUTCOME_EVENT_TYPES,
  buildOutcomeIndex,
  matchOutcome,
  type BookingKey,
  type OutcomeRecord,
} from './appointments';
import {
  computeCycleTotal,
  computePerformanceAmount,
} from './billing-model';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type BillingWorkStatus =
  | 'pending'
  | 'show'
  | 'no_show'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'lo_bailed';

export type BillingWorkRow = {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  scheduled_at: string | null;
  occurred_at: string | null;
  agent_name: string | null;
  calendar_name: string | null;
  status: BillingWorkStatus;
};

export type BillingWorkSummary = {
  booked: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  cancelled: number;
  rescheduled: number;
  pending: number;
  /** Shows ÷ (Shows + No Shows + LO bailed). */
  show_rate: number;
  /** Shows ÷ (Shows + No Shows). */
  net_show_rate: number;
  /** LO bailed ÷ Booked. */
  lo_bail_rate: number;
};

export type BillingWorkCharges = {
  base_amount: number;
  show_count: number;
  bailed_count: number;
  pay_per_show: number;
  pay_per_bailed: number;
  performance_amount: number;
  discount: number;
  total: number;
  /** Live counts from the itemized appointment rows (may differ from filed cycle counts). */
  live_show_count: number;
  live_bailed_count: number;
};

export type BillingWorkReport = {
  client_name: string;
  client_id: string;
  period_start: string;
  period_end: string;
  summary: BillingWorkSummary;
  rows: BillingWorkRow[];
  shows: BillingWorkRow[];
  lo_bailed: BillingWorkRow[];
  booked: BillingWorkRow[];
  charges: BillingWorkCharges | null;
};

const BOOKING_SELECT =
  'id, occurred_at, scheduled_at, external_id, calendar_name, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: string | null | undefined): value is string {
  return !!value && YMD_RE.test(value);
}

function ymdFromIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const slice = value.slice(0, 10);
  return isYmd(slice) ? slice : null;
}

/** Prefer scheduled appointment day; fall back to booking timestamp day. */
export function appointmentDay(row: {
  scheduled_at?: string | null;
  occurred_at?: string | null;
}): string | null {
  return ymdFromIso(row.scheduled_at) ?? ymdFromIso(row.occurred_at);
}

export function inPeriod(
  row: { scheduled_at?: string | null; occurred_at?: string | null },
  start: string,
  end: string,
): boolean {
  const day = appointmentDay(row);
  if (!day) return false;
  return day >= start && day <= end;
}

function asStatus(value: string | null | undefined): BillingWorkStatus {
  switch (value) {
    case 'show':
    case 'no_show':
    case 'appointment_cancelled':
    case 'appointment_rescheduled':
    case 'lo_bailed':
      return value;
    default:
      return 'pending';
  }
}

export function summarizeBillingWork(rows: Array<{ status: string }>): BillingWorkSummary {
  let shows = 0;
  let no_shows = 0;
  let lo_bailed = 0;
  let cancelled = 0;
  let rescheduled = 0;
  let pending = 0;

  for (const row of rows) {
    switch (row.status) {
      case 'show':
        shows++;
        break;
      case 'no_show':
        no_shows++;
        break;
      case 'lo_bailed':
        lo_bailed++;
        break;
      case 'appointment_cancelled':
        cancelled++;
        break;
      case 'appointment_rescheduled':
        rescheduled++;
        break;
      default:
        pending++;
        break;
    }
  }

  const booked = rows.length;
  const dispositioned = shows + no_shows + lo_bailed;
  const netDenom = shows + no_shows;

  return {
    booked,
    shows,
    no_shows,
    lo_bailed,
    cancelled,
    rescheduled,
    pending,
    show_rate: dispositioned > 0 ? (shows / dispositioned) * 100 : 0,
    net_show_rate: netDenom > 0 ? (shows / netDenom) * 100 : 0,
    lo_bail_rate: booked > 0 ? (lo_bailed / booked) * 100 : 0,
  };
}

async function fetchAll<R>(
  build: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
  hardCap = 10000,
): Promise<R[]> {
  const chunk = 1000;
  const rows: R[] = [];
  for (let from = 0; from < hardCap; from += chunk) {
    const { data, error } = await build(from, from + chunk - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < chunk) break;
  }
  return rows;
}

function sortRows(a: BillingWorkRow, b: BillingWorkRow): number {
  const da = appointmentDay(a) ?? '';
  const db = appointmentDay(b) ?? '';
  if (da !== db) return da.localeCompare(db);
  return (a.lead_name ?? '').localeCompare(b.lead_name ?? '');
}

export async function loadBillingWorkReport(
  service: ServiceClient,
  opts: {
    clientId: string;
    clientName: string;
    periodStart: string;
    periodEnd: string;
    cycleId?: string | null;
  },
): Promise<BillingWorkReport> {
  const { clientId, clientName, periodStart, periodEnd, cycleId } = opts;

  const bookings = await fetchAll<Record<string, unknown>>((from, to) =>
    service
      .from('events')
      .select(BOOKING_SELECT)
      .eq('client_id', clientId)
      .eq('event_type', 'appointment_booked')
      .order('scheduled_at', { ascending: true })
      .range(from, to),
  );

  const outcomes = await fetchAll<OutcomeRecord>((from, to) =>
    service
      .from('events')
      .select('id, event_type, external_id, raw, ghl_contact_id, scheduled_at')
      .eq('client_id', clientId)
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .range(from, to),
  );

  const index = buildOutcomeIndex(outcomes);
  const inRange = bookings.filter(b =>
    inPeriod(
      {
        scheduled_at: (b.scheduled_at as string | null) ?? null,
        occurred_at: (b.occurred_at as string | null) ?? null,
      },
      periodStart,
      periodEnd,
    ),
  );

  const rows: BillingWorkRow[] = inRange
    .map(b => {
      const outcome = matchOutcome(b as unknown as BookingKey, index);
      return {
        id: String(b.id),
        lead_name: (b.lead_name as string | null) ?? null,
        lead_phone: (b.lead_phone as string | null) ?? null,
        lead_email: (b.lead_email as string | null) ?? null,
        scheduled_at: (b.scheduled_at as string | null) ?? null,
        occurred_at: (b.occurred_at as string | null) ?? null,
        agent_name: (b.agent_name as string | null) ?? null,
        calendar_name: (b.calendar_name as string | null) ?? null,
        status: asStatus(outcome?.event_type),
      };
    })
    .sort(sortRows);

  const summary = summarizeBillingWork(rows);
  const shows = rows.filter(r => r.status === 'show');
  const loBailed = rows.filter(r => r.status === 'lo_bailed');

  let charges: BillingWorkCharges | null = null;
  if (cycleId) {
    const { data: cycle, error } = await service
      .from('client_billing_cycles')
      .select(
        'id, client_id, base_amount, show_count, bailed_count, pay_per_show, pay_per_bailed, performance_amount, discount, status',
      )
      .eq('id', cycleId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (cycle && cycle.status !== 'voided') {
      const base = Number(cycle.base_amount) || 0;
      const showCount = Number(cycle.show_count) || 0;
      const bailedCount = Number(cycle.bailed_count) || 0;
      const payPerShow = Number(cycle.pay_per_show) || 0;
      const payPerBailed = Number(cycle.pay_per_bailed) || 0;
      const discount = Number(cycle.discount) || 0;
      const performance =
        Number(cycle.performance_amount) ||
        computePerformanceAmount(
          { show_count: showCount, bailed_count: bailedCount },
          { pay_per_show: payPerShow, pay_per_bailed: payPerBailed },
        );
      charges = {
        base_amount: base,
        show_count: showCount,
        bailed_count: bailedCount,
        pay_per_show: payPerShow,
        pay_per_bailed: payPerBailed,
        performance_amount: performance,
        discount,
        total: computeCycleTotal(base, performance, discount),
        live_show_count: summary.shows,
        live_bailed_count: summary.lo_bailed,
      };
    }
  }

  return {
    client_name: clientName,
    client_id: clientId,
    period_start: periodStart,
    period_end: periodEnd,
    summary,
    rows,
    shows,
    lo_bailed: loBailed,
    booked: rows,
    charges,
  };
}
