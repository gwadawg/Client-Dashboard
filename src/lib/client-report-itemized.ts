import type { createServiceClient } from './supabase';
import {
  isYmd,
  loadBillingWorkReport,
  type BillingWorkReport,
  type BillingWorkRow,
} from './billing-work-report';

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Flattened, client-safe row for itemized tables. */
export type ClientReportWorkRow = {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  /** Primary date shown on the sheet (ISO). Prefer appointment time, else event date. */
  date: string | null;
  status: string;
};

export type ClientReportLeadRow = {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  /** When the lead was ingested. */
  date: string | null;
  is_qualified: boolean;
  is_hot: boolean;
  lead_source: string | null;
};

export type ClientReportWorkBundle = {
  booked: ClientReportWorkRow[];
  shows: ClientReportWorkRow[];
  no_shows: ClientReportWorkRow[];
  lo_bailed: ClientReportWorkRow[];
  live_transfers: ClientReportWorkRow[];
  claimed: ClientReportWorkRow[];
  summary: BillingWorkReport['summary'] & { claimed: number };
};

export type ClientReportItemized = {
  client_id: string;
  client_name: string;
  period_start: string;
  period_end: string;
  work: ClientReportWorkBundle | null;
  leads: ClientReportLeadRow[] | null;
};

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

function toWorkRow(row: BillingWorkRow, statusOverride?: string): ClientReportWorkRow {
  return {
    id: row.id,
    lead_name: row.lead_name,
    lead_phone: row.lead_phone,
    lead_email: row.lead_email,
    date: row.scheduled_at ?? row.occurred_at,
    status: statusOverride ?? row.status,
  };
}

function sortWork(a: ClientReportWorkRow, b: ClientReportWorkRow): number {
  const da = (a.date ?? '').slice(0, 10);
  const db = (b.date ?? '').slice(0, 10);
  if (da !== db) return da.localeCompare(db);
  return (a.lead_name ?? '').localeCompare(b.lead_name ?? '');
}

/**
 * Itemized client-report lists for the selected period (same date axis as KPIs).
 * - Work: booked (with outcome status), shows, no-shows, LO bails, live transfers, claimed
 * - Leads: every `lead` event in the range
 */
export async function loadClientReportItemized(
  service: ServiceClient,
  opts: {
    clientId: string;
    clientName: string;
    periodStart: string;
    periodEnd: string;
    includeWork: boolean;
    includeLeads: boolean;
  },
): Promise<ClientReportItemized> {
  const { clientId, clientName, periodStart, periodEnd, includeWork, includeLeads } = opts;
  if (!isYmd(periodStart) || !isYmd(periodEnd)) {
    throw new Error('periodStart and periodEnd must be YYYY-MM-DD');
  }
  if (periodStart > periodEnd) {
    throw new Error('periodStart must be on or before periodEnd');
  }

  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;

  let work: ClientReportWorkBundle | null = null;
  let leads: ClientReportLeadRow[] | null = null;

  if (includeWork) {
    const report = await loadBillingWorkReport(service, {
      clientId,
      clientName,
      periodStart,
      periodEnd,
    });

    const claimedEvents = await fetchAll<Record<string, unknown>>((from, to) =>
      service
        .from('events')
        .select('id, occurred_at, scheduled_at, lead_name, lead_phone, lead_email')
        .eq('client_id', clientId)
        .eq('event_type', 'claimed')
        .gte('occurred_at', startIso)
        .lte('occurred_at', endIso)
        .order('occurred_at', { ascending: true })
        .range(from, to),
    );

    const claimed: ClientReportWorkRow[] = claimedEvents
      .map(e => ({
        id: String(e.id),
        lead_name: (e.lead_name as string | null) ?? null,
        lead_phone: (e.lead_phone as string | null) ?? null,
        lead_email: (e.lead_email as string | null) ?? null,
        date: (e.scheduled_at as string | null) ?? (e.occurred_at as string | null) ?? null,
        status: 'claimed',
      }))
      .sort(sortWork);

    work = {
      booked: report.booked.map(r => toWorkRow(r)).sort(sortWork),
      shows: report.shows.map(r => toWorkRow(r, 'show')).sort(sortWork),
      no_shows: report.no_shows.map(r => toWorkRow(r, 'no_show')).sort(sortWork),
      lo_bailed: report.lo_bailed.map(r => toWorkRow(r, 'lo_bailed')).sort(sortWork),
      live_transfers: report.live_transfers.map(r => toWorkRow(r, 'live_transfer')).sort(sortWork),
      claimed,
      summary: { ...report.summary, claimed: claimed.length },
    };
  }

  if (includeLeads) {
    const leadEvents = await fetchAll<Record<string, unknown>>((from, to) =>
      service
        .from('events')
        .select(
          'id, occurred_at, lead_name, lead_phone, lead_email, is_qualified, is_hot, lead_source',
        )
        .eq('client_id', clientId)
        .eq('event_type', 'lead')
        .gte('occurred_at', startIso)
        .lte('occurred_at', endIso)
        .order('occurred_at', { ascending: true })
        .range(from, to),
    );

    leads = leadEvents
      .map(e => ({
        id: String(e.id),
        lead_name: (e.lead_name as string | null) ?? null,
        lead_phone: (e.lead_phone as string | null) ?? null,
        lead_email: (e.lead_email as string | null) ?? null,
        date: (e.occurred_at as string | null) ?? null,
        is_qualified: e.is_qualified === true,
        is_hot: e.is_hot === true,
        lead_source: (e.lead_source as string | null) ?? null,
      }))
      .sort((a, b) => {
        const da = (a.date ?? '').slice(0, 10);
        const db = (b.date ?? '').slice(0, 10);
        if (da !== db) return da.localeCompare(db);
        return (a.lead_name ?? '').localeCompare(b.lead_name ?? '');
      });
  }

  return {
    client_id: clientId,
    client_name: clientName,
    period_start: periodStart,
    period_end: periodEnd,
    work,
    leads,
  };
}
