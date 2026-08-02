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
import { leadIdentityKey } from './metrics';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type BillingWorkStatus =
  | 'pending'
  | 'show'
  | 'no_show'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'lo_bailed'
  | 'live_transfer';

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
  /** True when this row is included in the charge (unique billable outcome). */
  billable: boolean;
  /** Why this row is not charged — shown on the sheet for transparency. */
  dupe_reason: string | null;
};

export type BillingWorkSummary = {
  /** Total appointment_booked events in range (KPI "total"). */
  booked: number;
  /** Unique leads with appointment_booked in range (KPI "unique"). */
  unique_booked: number;
  /** Raw show events in range (sheet / KPI-style count). */
  shows: number;
  /** Unique billable shows (what we charge). */
  unique_shows: number;
  /** Raw live_transfer events in range. */
  live_transfers: number;
  /** Unique billable live transfers (conversations; counted even if lead also showed). */
  unique_live_transfers: number;
  /** Raw no_show events in range. */
  no_shows: number;
  /** Raw lo_bailed events in range. */
  lo_bailed: number;
  /** Unique billable LO bails (excludes leads who also showed). */
  unique_lo_bailed: number;
  cancelled: number;
  rescheduled: number;
  /** Bookings in range with no outcome yet. */
  pending: number;
  /** Shows ÷ (Shows + No Shows + LO bailed) using raw event counts. */
  show_rate: number;
  /** Shows ÷ (Shows + No Shows). */
  net_show_rate: number;
  /** LO bailed ÷ Booked (total) using raw event counts. */
  lo_bail_rate: number;
};

export type BillingWorkCharges = {
  base_amount: number;
  /** Unique billable shows. */
  show_count: number;
  /** Unique billable live transfers. */
  live_transfer_count: number;
  /** Unique billable LO bails. */
  bailed_count: number;
  pay_per_show: number;
  pay_per_bailed: number;
  performance_amount: number;
  discount: number;
  total: number;
  filed_show_count: number | null;
  filed_live_transfer_count: number | null;
  filed_bailed_count: number | null;
};

export type BillingWorkReport = {
  client_name: string;
  client_id: string;
  period_start: string;
  period_end: string;
  summary: BillingWorkSummary;
  rows: BillingWorkRow[];
  shows: BillingWorkRow[];
  live_transfers: BillingWorkRow[];
  lo_bailed: BillingWorkRow[];
  booked: BillingWorkRow[];
  charges: BillingWorkCharges | null;
};

type OutcomeEvent = {
  id: string;
  event_type: 'show' | 'lo_bailed' | 'live_transfer';
  occurred_at: string | null;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
};

const EVENT_SELECT =
  'id, event_type, occurred_at, scheduled_at, external_id, calendar_name, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, raw';

const RANGE_EVENT_TYPES = [
  'appointment_booked',
  'show',
  'no_show',
  'lo_bailed',
  'live_transfer',
  'appointment_cancelled',
  'appointment_rescheduled',
] as const;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: string | null | undefined): value is string {
  return !!value && YMD_RE.test(value);
}

function asStatus(value: string | null | undefined): BillingWorkStatus {
  switch (value) {
    case 'show':
    case 'no_show':
    case 'appointment_cancelled':
    case 'appointment_rescheduled':
    case 'lo_bailed':
    case 'live_transfer':
      return value;
    default:
      return 'pending';
  }
}

function toRow(
  e: Record<string, unknown>,
  status: BillingWorkStatus,
  billable = true,
  dupe_reason: string | null = null,
): BillingWorkRow {
  return {
    id: String(e.id),
    lead_name: (e.lead_name as string | null) ?? null,
    lead_phone: (e.lead_phone as string | null) ?? null,
    lead_email: (e.lead_email as string | null) ?? null,
    scheduled_at: (e.scheduled_at as string | null) ?? null,
    occurred_at: (e.occurred_at as string | null) ?? null,
    agent_name: (e.agent_name as string | null) ?? null,
    calendar_name: (e.calendar_name as string | null) ?? null,
    status,
    billable,
    dupe_reason,
  };
}

/**
 * Pick unique billable show / LO-bail outcomes per lead.
 * Rules:
 * - One charge per lead max for shows; extra show events are dupes.
 * - If a lead showed at all, no LO bail for that lead is charged (bail→show = not charged).
 * - Otherwise one LO bail charge per lead; extra bails are dupes.
 */
export function assignBillableOutcomes(
  clientId: string,
  showEvents: OutcomeEvent[],
  loBailEvents: OutcomeEvent[],
): {
  showFlags: Map<string, { billable: boolean; dupe_reason: string | null }>;
  bailFlags: Map<string, { billable: boolean; dupe_reason: string | null }>;
  unique_shows: number;
  unique_lo_bailed: number;
} {
  type LeadBucket = {
    shows: OutcomeEvent[];
    bails: OutcomeEvent[];
  };

  const byLead = new Map<string, LeadBucket>();

  const keyFor = (e: OutcomeEvent) =>
    leadIdentityKey({
      client_id: clientId,
      ghl_contact_id: e.ghl_contact_id,
      lead_phone: e.lead_phone,
      lead_email: e.lead_email,
      lead_name: e.lead_name,
    }) ?? `event:${e.id}`;

  for (const e of showEvents) {
    const key = keyFor(e);
    const bucket = byLead.get(key) ?? { shows: [], bails: [] };
    bucket.shows.push(e);
    byLead.set(key, bucket);
  }
  for (const e of loBailEvents) {
    const key = keyFor(e);
    const bucket = byLead.get(key) ?? { shows: [], bails: [] };
    bucket.bails.push(e);
    byLead.set(key, bucket);
  }

  const showFlags = new Map<string, { billable: boolean; dupe_reason: string | null }>();
  const bailFlags = new Map<string, { billable: boolean; dupe_reason: string | null }>();
  let unique_shows = 0;
  let unique_lo_bailed = 0;

  const byTime = (a: OutcomeEvent, b: OutcomeEvent) =>
    (a.occurred_at ?? '').localeCompare(b.occurred_at ?? '') || a.id.localeCompare(b.id);

  for (const bucket of byLead.values()) {
    bucket.shows.sort(byTime);
    bucket.bails.sort(byTime);

    if (bucket.shows.length > 0) {
      const [first, ...rest] = bucket.shows;
      showFlags.set(first.id, { billable: true, dupe_reason: null });
      unique_shows++;
      for (const dup of rest) {
        showFlags.set(dup.id, {
          billable: false,
          dupe_reason: 'Duplicate show — already charged for this lead',
        });
      }
      for (const bail of bucket.bails) {
        const showAfter =
          !!bail.occurred_at &&
          bucket.shows.some(s => (s.occurred_at ?? '') > (bail.occurred_at ?? ''));
        bailFlags.set(bail.id, {
          billable: false,
          dupe_reason: showAfter
            ? 'Lead showed after this bail — not charged'
            : 'Lead also showed — not charged (show takes precedence)',
        });
      }
    } else if (bucket.bails.length > 0) {
      const [first, ...rest] = bucket.bails;
      bailFlags.set(first.id, { billable: true, dupe_reason: null });
      unique_lo_bailed++;
      for (const dup of rest) {
        bailFlags.set(dup.id, {
          billable: false,
          dupe_reason: 'Duplicate LO bail — already charged for this lead',
        });
      }
    }
  }

  return { showFlags, bailFlags, unique_shows, unique_lo_bailed };
}

/**
 * One unique billable live transfer per lead (shows do not suppress LTs —
 * both count as conversations).
 */
export function assignBillableLiveTransfers(
  clientId: string,
  transferEvents: OutcomeEvent[],
): {
  transferFlags: Map<string, { billable: boolean; dupe_reason: string | null }>;
  unique_live_transfers: number;
} {
  type LeadBucket = { transfers: OutcomeEvent[] };
  const byLead = new Map<string, LeadBucket>();

  const keyFor = (e: OutcomeEvent) =>
    leadIdentityKey({
      client_id: clientId,
      ghl_contact_id: e.ghl_contact_id,
      lead_phone: e.lead_phone,
      lead_email: e.lead_email,
      lead_name: e.lead_name,
    }) ?? `event:${e.id}`;

  for (const e of transferEvents) {
    const key = keyFor(e);
    const bucket = byLead.get(key) ?? { transfers: [] };
    bucket.transfers.push(e);
    byLead.set(key, bucket);
  }

  const transferFlags = new Map<string, { billable: boolean; dupe_reason: string | null }>();
  let unique_live_transfers = 0;
  const byTime = (a: OutcomeEvent, b: OutcomeEvent) =>
    (a.occurred_at ?? '').localeCompare(b.occurred_at ?? '') || a.id.localeCompare(b.id);

  for (const bucket of byLead.values()) {
    bucket.transfers.sort(byTime);
    if (bucket.transfers.length === 0) continue;
    const [first, ...rest] = bucket.transfers;
    transferFlags.set(first.id, { billable: true, dupe_reason: null });
    unique_live_transfers++;
    for (const dup of rest) {
      transferFlags.set(dup.id, {
        billable: false,
        dupe_reason: 'Duplicate live transfer — already charged for this lead',
      });
    }
  }

  return { transferFlags, unique_live_transfers };
}

export function summarizeBillingWork(input: {
  booked: number;
  unique_booked: number;
  shows: number;
  unique_shows: number;
  live_transfers: number;
  unique_live_transfers: number;
  no_shows: number;
  lo_bailed: number;
  unique_lo_bailed: number;
  cancelled: number;
  rescheduled: number;
  pending: number;
}): BillingWorkSummary {
  const dispositioned = input.shows + input.no_shows + input.lo_bailed;
  const netDenom = input.shows + input.no_shows;
  return {
    ...input,
    show_rate: dispositioned > 0 ? (input.shows / dispositioned) * 100 : 0,
    net_show_rate: netDenom > 0 ? (input.shows / netDenom) * 100 : 0,
    lo_bail_rate: input.booked > 0 ? (input.lo_bailed / input.booked) * 100 : 0,
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
  // Billable rows first within a section, then by date.
  if (a.billable !== b.billable) return a.billable ? -1 : 1;
  const da = (a.scheduled_at ?? a.occurred_at ?? '').slice(0, 10);
  const db = (b.scheduled_at ?? b.occurred_at ?? '').slice(0, 10);
  if (da !== db) return da.localeCompare(db);
  return (a.lead_name ?? '').localeCompare(b.lead_name ?? '');
}

function asOutcomeEvent(
  e: Record<string, unknown>,
  type: 'show' | 'lo_bailed' | 'live_transfer',
): OutcomeEvent {
  return {
    id: String(e.id),
    event_type: type,
    occurred_at: (e.occurred_at as string | null) ?? null,
    ghl_contact_id: (e.ghl_contact_id as string | null) ?? null,
    lead_phone: (e.lead_phone as string | null) ?? null,
    lead_email: (e.lead_email as string | null) ?? null,
    lead_name: (e.lead_name as string | null) ?? null,
  };
}

/**
 * Client billing work report:
 * - Date window on event `occurred_at` (same axis as Client KPIs)
 * - Sheet lists every show / live transfer / LO bail; dupes marked, not charged
 * - Conversations = unique shows + unique live transfers at $/show
 * - LO bails charged separately (show wins over bail for same lead)
 */
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
  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;

  const events = await fetchAll<Record<string, unknown>>((from, to) =>
    service
      .from('events')
      .select(EVENT_SELECT)
      .eq('client_id', clientId)
      .in('event_type', [...RANGE_EVENT_TYPES])
      .gte('occurred_at', startIso)
      .lte('occurred_at', endIso)
      .order('occurred_at', { ascending: true })
      .range(from, to),
  );

  const bookings = events.filter(e => e.event_type === 'appointment_booked');
  const showEvents = events.filter(e => e.event_type === 'show');
  const transferEvents = events.filter(e => e.event_type === 'live_transfer');
  const noShowEvents = events.filter(e => e.event_type === 'no_show');
  const loBailEvents = events.filter(e => e.event_type === 'lo_bailed');
  const cancelledEvents = events.filter(e => e.event_type === 'appointment_cancelled');
  const rescheduledEvents = events.filter(e => e.event_type === 'appointment_rescheduled');

  const outcomes = await fetchAll<OutcomeRecord>((from, to) =>
    service
      .from('events')
      .select('id, event_type, external_id, raw, ghl_contact_id, scheduled_at')
      .eq('client_id', clientId)
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .range(from, to),
  );
  const index = buildOutcomeIndex(outcomes);

  const bookedRows: BillingWorkRow[] = bookings
    .map(b => {
      const outcome = matchOutcome(b as unknown as BookingKey, index);
      return toRow(b, asStatus(outcome?.event_type), true, null);
    })
    .sort(sortRows);

  const pending = bookedRows.filter(r => r.status === 'pending').length;

  const uniqueBookedKeys = new Set<string>();
  for (const b of bookings) {
    const key = leadIdentityKey({
      client_id: clientId,
      ghl_contact_id: (b.ghl_contact_id as string | null) ?? null,
      lead_phone: (b.lead_phone as string | null) ?? null,
      lead_email: (b.lead_email as string | null) ?? null,
      lead_name: (b.lead_name as string | null) ?? null,
    });
    if (key) uniqueBookedKeys.add(key);
  }

  const { showFlags, bailFlags, unique_shows, unique_lo_bailed } = assignBillableOutcomes(
    clientId,
    showEvents.map(e => asOutcomeEvent(e, 'show')),
    loBailEvents.map(e => asOutcomeEvent(e, 'lo_bailed')),
  );

  const { transferFlags, unique_live_transfers } = assignBillableLiveTransfers(
    clientId,
    transferEvents.map(e => asOutcomeEvent(e, 'live_transfer')),
  );

  const summary = summarizeBillingWork({
    booked: bookings.length,
    unique_booked: uniqueBookedKeys.size,
    shows: showEvents.length,
    unique_shows,
    live_transfers: transferEvents.length,
    unique_live_transfers,
    no_shows: noShowEvents.length,
    lo_bailed: loBailEvents.length,
    unique_lo_bailed,
    cancelled: cancelledEvents.length,
    rescheduled: rescheduledEvents.length,
    pending,
  });

  const shows = showEvents
    .map(e => {
      const flag = showFlags.get(String(e.id)) ?? { billable: true, dupe_reason: null };
      return toRow(e, 'show', flag.billable, flag.dupe_reason);
    })
    .sort(sortRows);

  const liveTransfers = transferEvents
    .map(e => {
      const flag = transferFlags.get(String(e.id)) ?? { billable: true, dupe_reason: null };
      return toRow(e, 'live_transfer', flag.billable, flag.dupe_reason);
    })
    .sort(sortRows);

  const loBailed = loBailEvents
    .map(e => {
      const flag = bailFlags.get(String(e.id)) ?? { billable: true, dupe_reason: null };
      return toRow(e, 'lo_bailed', flag.billable, flag.dupe_reason);
    })
    .sort(sortRows);

  let charges: BillingWorkCharges | null = null;
  if (cycleId) {
    const { data: cycle, error } = await service
      .from('client_billing_cycles')
      .select(
        'id, client_id, base_amount, show_count, live_transfer_count, bailed_count, pay_per_show, pay_per_bailed, discount, status',
      )
      .eq('id', cycleId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (cycle && cycle.status !== 'voided') {
      const base = Number(cycle.base_amount) || 0;
      const payPerShow = Number(cycle.pay_per_show) || 0;
      const payPerBailed = Number(cycle.pay_per_bailed) || 0;
      const discount = Number(cycle.discount) || 0;
      const liveShows = unique_shows;
      const liveLts = unique_live_transfers;
      const liveBailed = unique_lo_bailed;
      const filedShows = Number(cycle.show_count) || 0;
      const filedLts = Number(cycle.live_transfer_count) || 0;
      const filedBailed = Number(cycle.bailed_count) || 0;
      const mismatched =
        filedShows !== liveShows || filedLts !== liveLts || filedBailed !== liveBailed;
      const performance = computePerformanceAmount(
        {
          show_count: liveShows,
          live_transfer_count: liveLts,
          bailed_count: liveBailed,
        },
        { pay_per_show: payPerShow, pay_per_bailed: payPerBailed },
      );
      charges = {
        base_amount: base,
        show_count: liveShows,
        live_transfer_count: liveLts,
        bailed_count: liveBailed,
        pay_per_show: payPerShow,
        pay_per_bailed: payPerBailed,
        performance_amount: performance,
        discount,
        total: computeCycleTotal(base, performance, discount),
        filed_show_count: mismatched ? filedShows : null,
        filed_live_transfer_count: mismatched ? filedLts : null,
        filed_bailed_count: mismatched ? filedBailed : null,
      };
    }
  }

  return {
    client_name: clientName,
    client_id: clientId,
    period_start: periodStart,
    period_end: periodEnd,
    summary,
    rows: bookedRows,
    shows,
    live_transfers: liveTransfers,
    lo_bailed: loBailed,
    booked: bookedRows,
    charges,
  };
}
