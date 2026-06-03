import {
  computeSpeedToLead,
  type AvailabilityWindow,
  type SpeedToLeadEventRow,
} from '@/lib/speed-to-lead';
import { CALL_CENTER_TIMEZONE } from '@/lib/time';

export type EventRow = {
  client_id?: string | null;
  event_type: string;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
  phone_number_used?: string | null;
  agent_name?: string | null;
  occurred_at?: string | null;
  occurred_at_has_time?: boolean | null;
  lead_created_at?: string | null;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  speed_to_lead_seconds: number | null;
  is_qualified?: boolean | null;
  is_hot?: boolean | null;
  is_out_of_state?: boolean | null;
};

export type SpendRow = { amount: number | string; platform?: string | null };

export type TrendEventRow = {
  event_type: string;
  occurred_at: string;
  is_qualified?: boolean | null;
};

export type TrendSpendRow = { spend_date: string; amount: number | string };

export type DailyCostBucket = {
  date: string;
  spend: number;
  leads: number;
  qualified_leads: number;
  /** Client conversations: live transfers + shows + claimed */
  client_conversations: number;
};

export type CostTrendPoint = {
  date: string;
  spend: number;
  leads: number;
  qualified_leads: number;
  client_conversations: number;
  cpl: number | null;
  cp_qualified: number | null;
  cp_conversation: number | null;
};

export type MetricsResult = {
  new_leads: number;
  qualified_leads: number;
  hot_leads: number;
  out_of_state_leads: number;
  booked_appointments: number;
  appt_booking_rate: number;
  appts_to_take_place: number;
  shows: number;
  no_shows: number;
  show_pct: number;
  /** True show rate: shows ÷ (shows + no-shows). Excludes cancellations, LO bails, and pending. */
  net_show_pct: number;
  /** LO bailed ÷ appointments booked. */
  lo_bail_rate: number;
  /** (claimed + shows + live transfers) ÷ qualified leads. */
  conversation_rate: number;
  appointment_cancelled: number;
  cancel_rate: number;
  /** Partner LO did not attend scheduled appointment with lead (“bailed”). */
  lo_bailed: number;
  /** Deal submitted / in processing (not yet funded). */
  loan_processing: number;
  live_transfers: number;
  /** Client manually contacted or spoke with the lead outside our booking flow. */
  claimed: number;
  total_conversations: number;
  proposals_sent: number;
  closed: number;
  proposals_made: number;
  submissions_made: number;
  funded_loans: number;
  cp_proposal_made: number;
  cp_submission_made: number;
  cp_loan_funded: number;
  /** Sum of all spend (Meta from meta_ad_insights + Google / Local Services from ad_spend). */
  ad_spend: number;
  /** Meta / Facebook spend only (sum of meta_ad_insights). */
  ad_spend_meta: number;
  cpl: number;
  cp_qualified: number;
  cp_hot: number;
  cp_conversation: number;
  cp_appt: number;
  cps: number;
  outbound_dials: number;
  dials_per_lead: number;
  pickups: number;
  pickup_pct: number;
  conversations: number;
  conversation_pct: number;
  callbacks: number;
  cb_pct: number;
  /** Median minutes lead→first dial (precise timestamps + in-window leads only). */
  speed_to_lead_min: number;
  /** Number of leads contributing to speed_to_lead_min. */
  speed_to_lead_sample_size: number;
  /** Leads excluded from speed-to-lead because they arrived off-hours. */
  speed_to_lead_excluded_out_of_window: number;
  /** Leads/dials excluded from speed-to-lead due to a missing precise timestamp. */
  speed_to_lead_excluded_no_time: number;
};

const PROPOSAL_EVENT_TYPES = new Set(['proposal_made', 'proposal_sent']);
const SUBMISSION_EVENT_TYPES = new Set(['submission_made', 'loan_processing']);
const FUNDED_EVENT_TYPES = new Set(['loan_funded', 'closed']);

function normalizePhoneForKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function leadIdentityKey(event: EventRow): string | null {
  const clientId = event.client_id ?? '';
  const ghl = (event.ghl_contact_id ?? '').trim();
  if (ghl) return `${clientId}|ghl:${ghl}`;
  const phone = normalizePhoneForKey(event.lead_phone);
  if (phone) return `${clientId}|phone:${phone}`;
  const email = (event.lead_email ?? '').trim().toLowerCase();
  if (email) return `${clientId}|email:${email}`;
  const name = (event.lead_name ?? '').trim().toLowerCase();
  if (name) return `${clientId}|name:${name}`;
  return null;
}

function uniqueLeadCountForEvents(events: EventRow[], eventTypes: Set<string>): number {
  const leadKeys = new Set<string>();
  for (const event of events) {
    if (!eventTypes.has(event.event_type)) continue;
    const key = leadIdentityKey(event);
    if (!key) continue;
    leadKeys.add(key);
  }
  return leadKeys.size;
}

export function calculateMetrics(
  events: EventRow[],
  spendRows: SpendRow[],
  availability: AvailabilityWindow[] = [],
  timeZone: string = CALL_CENTER_TIMEZONE,
): MetricsResult {
  const leadEvents = events.filter(e => e.event_type === 'lead');
  const leads = leadEvents.length;
  const qualified_leads = leadEvents.filter(e => e.is_qualified === true).length;
  const hot_leads = leadEvents.filter(e => e.is_hot === true).length;
  const out_of_state_leads =
    leadEvents.filter(e => e.is_out_of_state === true).length +
    events.filter(e => e.event_type === 'out_of_state_lead').length;

  const booked = events.filter(e => e.event_type === 'appointment_booked').length;
  const cancelled = events.filter(e => e.event_type === 'appointment_cancelled').length;
  const shows = events.filter(e => e.event_type === 'show').length;
  const no_shows = events.filter(e => e.event_type === 'no_show').length;
  const lo_bailed = events.filter(e => e.event_type === 'lo_bailed').length;
  const loan_processing = events.filter(e => SUBMISSION_EVENT_TYPES.has(e.event_type)).length;
  const scheduled_total = booked + cancelled;
  // Appointments that actually took place (or should have). Excludes still-pending
  // bookings AND cancellations so the show rate reflects only appointments that were
  // expected to happen — not ones that haven't happened or were called off.
  const dispositioned_appointments = shows + no_shows + lo_bailed;
  const dials = events.filter(e => e.event_type === 'dial');
  const dial_count = dials.length;
  const pickups = dials.filter(e => e.is_pickup).length;
  const conversations = dials.filter(e => e.is_conversation).length;
  const callbacks = events.filter(e => e.event_type === 'callback_booked').length;
  const live_transfers = events.filter(e => e.event_type === 'live_transfer').length;
  const claimed = events.filter(e => e.event_type === 'claimed').length;
  const proposals_sent = events.filter(e => PROPOSAL_EVENT_TYPES.has(e.event_type)).length;
  const closed = events.filter(e => FUNDED_EVENT_TYPES.has(e.event_type)).length;
  // Funnel rollup: reaching a later stage implies every earlier stage.
  // Funded ⇒ also counts as submitted + proposed; Submitted ⇒ also counts as proposed.
  // Implied stages are derived here at read time so the event log stays truthful
  // (no synthetic proposal/submission rows) and counts stay deduped by lead.
  const submissionOrBeyondTypes = new Set([...SUBMISSION_EVENT_TYPES, ...FUNDED_EVENT_TYPES]);
  const proposalOrBeyondTypes = new Set([
    ...PROPOSAL_EVENT_TYPES,
    ...SUBMISSION_EVENT_TYPES,
    ...FUNDED_EVENT_TYPES,
  ]);
  const proposals_made = uniqueLeadCountForEvents(events, proposalOrBeyondTypes);
  const submissions_made = uniqueLeadCountForEvents(events, submissionOrBeyondTypes);
  const funded_loans = uniqueLeadCountForEvents(events, FUNDED_EVENT_TYPES);

  const ad_spend = spendRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const ad_spend_meta = spendRows
    .filter(r => r.platform === 'meta')
    .reduce((sum, r) => sum + Number(r.amount), 0);

  // Speed-to-lead: lead↔first-dial pairing, precise timestamps + in-window leads only,
  // summarized as a median (see src/lib/speed-to-lead.ts).
  const speedEvents: SpeedToLeadEventRow[] = events
    .filter(e => typeof e.occurred_at === 'string')
    .map(e => ({
      event_type: e.event_type,
      client_id: e.client_id ?? null,
      ghl_contact_id: e.ghl_contact_id ?? null,
      lead_phone: e.lead_phone ?? null,
      phone_number_used: e.phone_number_used ?? null,
      agent_name: e.agent_name ?? null,
      occurred_at: e.occurred_at as string,
      occurred_at_has_time: e.occurred_at_has_time ?? null,
      lead_created_at: e.lead_created_at ?? null,
    }));
  const speed = computeSpeedToLead(speedEvents, availability, timeZone);
  const speed_to_lead_min = speed.median_min ?? 0;

  const client_conversations = live_transfers + claimed + shows;

  return {
    new_leads: leads,
    qualified_leads,
    hot_leads,
    out_of_state_leads,
    booked_appointments: booked,
    appt_booking_rate: qualified_leads > 0 ? (booked / qualified_leads) * 100 : 0,
    appts_to_take_place: Math.max(0, booked - shows - no_shows - cancelled - lo_bailed),
    shows,
    no_shows,
    show_pct: dispositioned_appointments > 0 ? (shows / dispositioned_appointments) * 100 : 0,
    net_show_pct: shows + no_shows > 0 ? (shows / (shows + no_shows)) * 100 : 0,
    lo_bail_rate: booked > 0 ? (lo_bailed / booked) * 100 : 0,
    conversation_rate: qualified_leads > 0 ? (client_conversations / qualified_leads) * 100 : 0,
    appointment_cancelled: cancelled,
    cancel_rate: scheduled_total > 0 ? (cancelled / scheduled_total) * 100 : 0,
    lo_bailed,
    loan_processing,
    live_transfers,
    claimed,
    total_conversations: conversations + claimed,
    proposals_sent,
    closed,
    proposals_made,
    submissions_made,
    funded_loans,
    cp_proposal_made: proposals_made > 0 ? ad_spend / proposals_made : 0,
    cp_submission_made: submissions_made > 0 ? ad_spend / submissions_made : 0,
    cp_loan_funded: funded_loans > 0 ? ad_spend / funded_loans : 0,
    ad_spend,
    ad_spend_meta,
    cpl: leads > 0 ? ad_spend / leads : 0,
    cp_qualified: qualified_leads > 0 ? ad_spend / qualified_leads : 0,
    cp_hot: hot_leads > 0 ? ad_spend / hot_leads : 0,
    cp_conversation: client_conversations > 0 ? ad_spend / client_conversations : 0,
    cp_appt: booked > 0 ? ad_spend / booked : 0,
    cps: shows > 0 ? ad_spend / shows : 0,
    outbound_dials: dial_count,
    dials_per_lead: leads > 0 ? dial_count / leads : 0,
    pickups,
    pickup_pct: dial_count > 0 ? (pickups / dial_count) * 100 : 0,
    conversations,
    conversation_pct: pickups > 0 ? (conversations / pickups) * 100 : 0,
    callbacks,
    cb_pct: leads > 0 ? (callbacks / leads) * 100 : 0,
    speed_to_lead_min,
    speed_to_lead_sample_size: speed.sample_size,
    speed_to_lead_excluded_out_of_window: speed.excluded_out_of_window,
    speed_to_lead_excluded_no_time: speed.excluded_no_time,
  };
}

function utcDateKey(iso: string): string {
  return new Date(iso).toISOString().split('T')[0];
}

function eachDateInRange(rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${rangeStart}T00:00:00.000Z`);
  const end = new Date(`${rangeEnd}T00:00:00.000Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Monday (UTC) of the week containing `dateStr` (YYYY-MM-DD). */
export function weekStartKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

export function daysInRange(rangeStart: string, rangeEnd: string): number {
  if (!rangeStart || !rangeEnd) return 0;
  const start = new Date(`${rangeStart}T00:00:00.000Z`).getTime();
  const end = new Date(`${rangeEnd}T00:00:00.000Z`).getTime();
  if (end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

export function buildDailyCostSeries(
  events: TrendEventRow[],
  spendRows: TrendSpendRow[],
  rangeStart: string,
  rangeEnd: string,
): DailyCostBucket[] {
  const byDate = new Map<string, DailyCostBucket>();

  for (const date of eachDateInRange(rangeStart, rangeEnd)) {
    byDate.set(date, { date, spend: 0, leads: 0, qualified_leads: 0, client_conversations: 0 });
  }

  for (const row of spendRows) {
    const date = row.spend_date;
    if (!byDate.has(date)) continue;
    const bucket = byDate.get(date)!;
    bucket.spend += Number(row.amount);
  }

  for (const e of events) {
    const date = utcDateKey(e.occurred_at);
    if (!byDate.has(date)) continue;
    const bucket = byDate.get(date)!;
    if (e.event_type === 'lead') {
      bucket.leads++;
      if (e.is_qualified === true) bucket.qualified_leads++;
    } else if (
      e.event_type === 'live_transfer' ||
      e.event_type === 'show' ||
      e.event_type === 'claimed'
    ) {
      bucket.client_conversations++;
    }
  }

  return eachDateInRange(rangeStart, rangeEnd).map(date => byDate.get(date)!);
}

export function rollupCostSeriesToWeeks(daily: DailyCostBucket[]): DailyCostBucket[] {
  const byWeek = new Map<string, DailyCostBucket>();
  for (const row of daily) {
    const key = weekStartKey(row.date);
    let bucket = byWeek.get(key);
    if (!bucket) {
      bucket = { date: key, spend: 0, leads: 0, qualified_leads: 0, client_conversations: 0 };
      byWeek.set(key, bucket);
    }
    bucket.spend += row.spend;
    bucket.leads += row.leads;
    bucket.qualified_leads += row.qualified_leads;
    bucket.client_conversations += row.client_conversations;
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function toCostTrendPoints(buckets: DailyCostBucket[]): CostTrendPoint[] {
  return buckets.map(b => ({
    date: b.date,
    spend: b.spend,
    leads: b.leads,
    qualified_leads: b.qualified_leads,
    client_conversations: b.client_conversations,
    cpl: b.leads > 0 ? b.spend / b.leads : null,
    cp_qualified: b.qualified_leads > 0 ? b.spend / b.qualified_leads : null,
    cp_conversation: b.client_conversations > 0 ? b.spend / b.client_conversations : null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-client KPI timeline (drop-off detection)
// ─────────────────────────────────────────────────────────────────────────────

export type KpiTimelineEventRow = {
  event_type: string;
  occurred_at: string;
  is_qualified?: boolean | null;
};

export type KpiTimelineBucket = {
  /** Bucket start date (YYYY-MM-DD): the day, or the Monday of the week. */
  date: string;
  spend: number;
  leads: number;
  qualified_leads: number;
  booked: number;
  shows: number;
  no_shows: number;
  client_conversations: number;
  cpconv: number | null;
  cpql: number | null;
  cpl: number | null;
  show_rate: number | null;
  net_show_rate: number | null;
  booking_rate: number | null;
  conversation_rate: number | null;
  lead_to_qual: number | null;
};

type RawCounts = {
  date: string;
  spend: number;
  leads: number;
  qualified_leads: number;
  booked: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  cancelled: number;
  live_transfers: number;
  claimed: number;
};

function emptyCounts(date: string): RawCounts {
  return {
    date,
    spend: 0,
    leads: 0,
    qualified_leads: 0,
    booked: 0,
    shows: 0,
    no_shows: 0,
    lo_bailed: 0,
    cancelled: 0,
    live_transfers: 0,
    claimed: 0,
  };
}

function finalizeBucket(c: RawCounts): KpiTimelineBucket {
  const client_conversations = c.live_transfers + c.claimed + c.shows;
  const dispositioned = c.shows + c.no_shows + c.lo_bailed;
  return {
    date: c.date,
    spend: c.spend,
    leads: c.leads,
    qualified_leads: c.qualified_leads,
    booked: c.booked,
    shows: c.shows,
    no_shows: c.no_shows,
    client_conversations,
    cpconv: client_conversations > 0 ? c.spend / client_conversations : null,
    cpql: c.qualified_leads > 0 ? c.spend / c.qualified_leads : null,
    cpl: c.leads > 0 ? c.spend / c.leads : null,
    show_rate: dispositioned > 0 ? (c.shows / dispositioned) * 100 : null,
    net_show_rate: c.shows + c.no_shows > 0 ? (c.shows / (c.shows + c.no_shows)) * 100 : null,
    booking_rate: c.qualified_leads > 0 ? (c.booked / c.qualified_leads) * 100 : null,
    conversation_rate: c.qualified_leads > 0 ? (client_conversations / c.qualified_leads) * 100 : null,
    lead_to_qual: c.leads > 0 ? (c.qualified_leads / c.leads) * 100 : null,
  };
}

/**
 * Build a per-day or per-week KPI timeline for a single client so the team can
 * see exactly when an account fell off. Derived rates are recomputed per bucket
 * (never averaged) so they stay mathematically correct.
 */
export function buildClientKpiTimeline(
  events: KpiTimelineEventRow[],
  spendRows: TrendSpendRow[],
  rangeStart: string,
  rangeEnd: string,
  granularity: 'day' | 'week' = 'week',
): KpiTimelineBucket[] {
  const byDate = new Map<string, RawCounts>();
  for (const date of eachDateInRange(rangeStart, rangeEnd)) {
    byDate.set(date, emptyCounts(date));
  }

  for (const row of spendRows) {
    const bucket = byDate.get(row.spend_date);
    if (bucket) bucket.spend += Number(row.amount);
  }

  for (const e of events) {
    const date = utcDateKey(e.occurred_at);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    if (e.event_type === 'lead') {
      bucket.leads++;
      if (e.is_qualified === true) bucket.qualified_leads++;
    } else if (e.event_type === 'appointment_booked') {
      bucket.booked++;
    } else if (e.event_type === 'show') {
      bucket.shows++;
    } else if (e.event_type === 'no_show') {
      bucket.no_shows++;
    } else if (e.event_type === 'lo_bailed') {
      bucket.lo_bailed++;
    } else if (e.event_type === 'appointment_cancelled') {
      bucket.cancelled++;
    } else if (e.event_type === 'live_transfer') {
      bucket.live_transfers++;
    } else if (e.event_type === 'claimed') {
      bucket.claimed++;
    }
  }

  const daily = eachDateInRange(rangeStart, rangeEnd).map(date => byDate.get(date)!);

  if (granularity === 'day') {
    return daily.map(finalizeBucket);
  }

  const byWeek = new Map<string, RawCounts>();
  for (const row of daily) {
    const key = weekStartKey(row.date);
    let bucket = byWeek.get(key);
    if (!bucket) {
      bucket = emptyCounts(key);
      byWeek.set(key, bucket);
    }
    bucket.spend += row.spend;
    bucket.leads += row.leads;
    bucket.qualified_leads += row.qualified_leads;
    bucket.booked += row.booked;
    bucket.shows += row.shows;
    bucket.no_shows += row.no_shows;
    bucket.lo_bailed += row.lo_bailed;
    bucket.cancelled += row.cancelled;
    bucket.live_transfers += row.live_transfers;
    bucket.claimed += row.claimed;
  }

  return [...byWeek.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(finalizeBucket);
}

/** Parse GHL/sheet Y/N or boolean flags on webhook payloads. */
export function parseYnFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'y' || v === 'yes' || v === 'true' || v === '1';
  }
  return false;
}
