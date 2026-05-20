export type EventRow = {
  event_type: string;
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
  /** Sum of all imported spend (Meta + Google + Local Services). */
  ad_spend: number;
  /** Meta / Facebook spend only (compare to Ads Manager). */
  ad_spend_meta: number;
  cpl: number;
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
  speed_to_lead_min: number;
};

export function calculateMetrics(events: EventRow[], spendRows: SpendRow[]): MetricsResult {
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
  const loan_processing = events.filter(e => e.event_type === 'loan_processing').length;
  const scheduled_total = booked + cancelled;
  const dials = events.filter(e => e.event_type === 'dial');
  const dial_count = dials.length;
  const pickups = dials.filter(e => e.is_pickup).length;
  const conversations = dials.filter(e => e.is_conversation).length;
  const callbacks = events.filter(e => e.event_type === 'callback_booked').length;
  const live_transfers = events.filter(e => e.event_type === 'live_transfer').length;
  const claimed = events.filter(e => e.event_type === 'claimed').length;
  const proposals_sent = events.filter(e => e.event_type === 'proposal_sent').length;
  const closed = events.filter(e => e.event_type === 'closed').length;

  const ad_spend = spendRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const ad_spend_meta = spendRows
    .filter(r => r.platform === 'meta')
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const speedReadings = dials
    .filter(e => e.speed_to_lead_seconds != null)
    .map(e => Number(e.speed_to_lead_seconds));
  const speed_to_lead_min =
    speedReadings.length > 0
      ? speedReadings.reduce((a, b) => a + b, 0) / speedReadings.length / 60
      : 0;

  return {
    new_leads: leads,
    qualified_leads,
    hot_leads,
    out_of_state_leads,
    booked_appointments: booked,
    appt_booking_rate: leads > 0 ? (booked / leads) * 100 : 0,
    appts_to_take_place: Math.max(0, booked - shows - no_shows - cancelled - lo_bailed),
    shows,
    no_shows,
    show_pct: booked > 0 ? (shows / booked) * 100 : 0,
    appointment_cancelled: cancelled,
    cancel_rate: scheduled_total > 0 ? (cancelled / scheduled_total) * 100 : 0,
    lo_bailed,
    loan_processing,
    live_transfers,
    claimed,
    total_conversations: conversations + claimed,
    proposals_sent,
    closed,
    ad_spend,
    ad_spend_meta,
    cpl: leads > 0 ? ad_spend / leads : 0,
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

/** Parse GHL/sheet Y/N or boolean flags on webhook payloads. */
export function parseYnFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'y' || v === 'yes' || v === 'true' || v === '1';
  }
  return false;
}
