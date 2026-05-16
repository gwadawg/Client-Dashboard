export type EventRow = {
  event_type: string;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  speed_to_lead_seconds: number | null;
  is_qualified?: boolean | null;
  is_hot?: boolean | null;
  is_out_of_state?: boolean | null;
};

export type SpendRow = { amount: number | string };

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
  live_transfers: number;
  /** Client manually contacted or spoke with the lead outside our booking flow. */
  claimed: number;
  total_conversations: number;
  proposals_sent: number;
  closed: number;
  ad_spend: number;
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
    appts_to_take_place: Math.max(0, booked - shows - no_shows - cancelled),
    shows,
    no_shows,
    show_pct: booked > 0 ? (shows / booked) * 100 : 0,
    appointment_cancelled: cancelled,
    cancel_rate: scheduled_total > 0 ? (cancelled / scheduled_total) * 100 : 0,
    live_transfers,
    claimed,
    total_conversations: conversations + claimed,
    proposals_sent,
    closed,
    ad_spend,
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

/** Parse GHL/sheet Y/N or boolean flags on webhook payloads. */
export function parseYnFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'y' || v === 'yes' || v === 'true' || v === '1';
  }
  return false;
}
