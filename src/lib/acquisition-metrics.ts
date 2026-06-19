// Acquisition funnel KPI engine — mirrors business-metrics.ts / metrics.ts pattern.

import {
  DOWNSELL_OFFER_TYPES,
  CORE_OFFER_TYPES,
  isMetaLeadSource,
  META_FUNNEL_EXCLUDED_TYPES,
  type AcquisitionApptStatus,
} from './acquisition-config';

export type DateMode = 'booked' | 'scheduled' | 'lead_created' | 'offered';

/** Controls which offers/closes count toward offer/close/cash KPIs. */
export type OfferScope = 'core' | 'skool' | 'all_downsells' | 'all';

export type AcquisitionLeadRow = {
  id: string;
  source: string | null;
  created_at: string;
  qualified: boolean | null;
};

export type AcquisitionAppointmentRow = {
  id: string;
  lead_id: string | null;
  appointment_type: string;
  booked_at: string | null;
  scheduled_at: string | null;
  status: AcquisitionApptStatus | string;
  qualified: boolean | null;
  setter_name: string | null;
  how_booked?: string | null;
};

export type AcquisitionOfferRow = {
  id: string;
  lead_id: string | null;
  appointment_id: string | null;
  offered_at: string;
  offer_type: string;
  is_closed: boolean;
  cash_collected: number | null;
  setter_name: string | null;
};

export type AcquisitionCloseRow = {
  id: string;
  lead_id: string | null;
  closed_at: string;
  offer_type: string | null;
  cash_collected?: number | null;
};

export type AcquisitionAdSpendRow = {
  insight_date: string;
  amount_spent: number;
};

export type NoShowBreakdown = {
  showed: number;
  lead_no_show: number;
  cancelled: number;
  team_no_show: number;
  total_taken_place: number;
  /** showed ÷ (showed + lead_no_show + team_no_show), excludes cancelled */
  show_rate: number | null;
};

export type AcquisitionMetricsInput = {
  leads: AcquisitionLeadRow[];
  appointments: AcquisitionAppointmentRow[];
  offers: AcquisitionOfferRow[];
  closes: AcquisitionCloseRow[];
  adSpend: AcquisitionAdSpendRow[];
  from: string;
  to: string;
  dateMode?: DateMode;
  /** @deprecated Use offerScope instead. When true behaves like offerScope='all'. */
  includeDownsells?: boolean;
  /** Controls which offer/close types count in KPIs. Default 'core'. */
  offerScope?: OfferScope;
  /** Filter to Meta leads only for cost metric denominators. Default false (all sources). */
  metaOnly?: boolean;
  setterFilter?: string | null;
};

export type AcquisitionMetricsResult = {
  ad_spend: number;
  leads: number;
  meta_leads: number;
  intros_booked: number;
  intros_showed: number;
  intros_taken_place: number;
  demos_booked: number;
  demos_showed: number;
  demos_taken_place: number;
  offers_made: number;
  closes: number;
  cash_collected: number;
  intro_booking_rate: number | null;
  intro_show_rate: number | null;
  demo_booking_rate: number | null;
  demo_show_rate: number | null;
  offer_rate: number | null;
  close_rate: number | null;
  demo_to_close_rate: number | null;
  cpl: number | null;
  cost_per_intro: number | null;
  cost_per_intro_showed: number | null;
  cost_per_demo_booked: number | null;
  cost_per_demo_showed: number | null;
  cost_per_offer: number | null;
  cac: number | null;
  no_show_breakdown: NoShowBreakdown;
  cost_per_no_show: number | null;
};

export function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= from && d <= to;
}

function isDownsellOffer(offerType: string): boolean {
  return DOWNSELL_OFFER_TYPES.has(offerType) || DOWNSELL_OFFER_TYPES.has(offerType.toLowerCase());
}

function isSkoolOffer(offerType: string): boolean {
  return offerType.toLowerCase() === 'skool';
}

export function offerMatchesScope(offerType: string | null, scope: OfferScope): boolean {
  const t = offerType ?? 'Core Offer';
  if (scope === 'all') return true;
  if (scope === 'all_downsells') return isDownsellOffer(t);
  if (scope === 'skool') return isSkoolOffer(t);
  // 'core' — Core Offer, RM, or anything not in the downsell set
  return !isDownsellOffer(t);
}

export function tookPlace(status: string): boolean {
  return status === 'showed' || status === 'no_show' || status === 'team_no_show';
}

export function calculateAcquisitionMetrics(input: AcquisitionMetricsInput): AcquisitionMetricsResult {
  const {
    leads,
    appointments,
    offers,
    closes,
    adSpend,
    from,
    to,
    offerScope: rawScope,
    includeDownsells,
    metaOnly = false,
  } = input;

  // Legacy includeDownsells maps to scope='all'; explicit offerScope takes precedence.
  const offerScope: OfferScope = rawScope ?? (includeDownsells ? 'all' : 'core');

  const spend = adSpend
    .filter(r => inRange(r.insight_date, from, to))
    .reduce((s, r) => s + Number(r.amount_spent ?? 0), 0);

  const leadsInRange = leads.filter(l => inRange(l.created_at, from, to));
  const metaLeads = leadsInRange.filter(l => isMetaLeadSource(l.source));
  // Cost denominators use meta leads; funnel volume always uses all leads.
  const costLeadDenominator = metaOnly ? metaLeads.length : metaLeads.length;

  const appts = appointments.filter(a => !META_FUNNEL_EXCLUDED_TYPES.has(a.appointment_type));

  // Intro stages — booked by booked_at, show/no-show by scheduled_at (mixed canonical)
  const introsBooked = appts.filter(
    a => a.appointment_type === 'intro' && inRange(a.booked_at, from, to),
  );
  const introsShowed = appts.filter(
    a => a.appointment_type === 'intro' && a.status === 'showed' && inRange(a.scheduled_at, from, to),
  );
  const introsTakenPlace = appts.filter(
    a => a.appointment_type === 'intro' && tookPlace(a.status) && inRange(a.scheduled_at, from, to),
  );

  // Demo stages
  const demosBooked = appts.filter(
    a => a.appointment_type === 'demo' && inRange(a.booked_at, from, to),
  );
  const demosShowed = appts.filter(
    a => a.appointment_type === 'demo' && a.status === 'showed' && inRange(a.scheduled_at, from, to),
  );
  const demosTakenPlace = appts.filter(
    a => a.appointment_type === 'demo' && tookPlace(a.status) && inRange(a.scheduled_at, from, to),
  );

  // No-show breakdown across ALL funnel appointment types (intro + demo)
  const allFunnelAppts = appts.filter(
    a => (a.appointment_type === 'intro' || a.appointment_type === 'demo') &&
      inRange(a.scheduled_at, from, to),
  );
  const nsShowed = allFunnelAppts.filter(a => a.status === 'showed').length;
  const nsLeadNoShow = allFunnelAppts.filter(a => a.status === 'no_show').length;
  const nsCancelled = allFunnelAppts.filter(a => a.status === 'cancelled').length;
  const nsTeamNoShow = allFunnelAppts.filter(a => a.status === 'team_no_show').length;
  const nsTakenPlace = nsShowed + nsLeadNoShow + nsTeamNoShow;
  const no_show_breakdown: NoShowBreakdown = {
    showed: nsShowed,
    lead_no_show: nsLeadNoShow,
    cancelled: nsCancelled,
    team_no_show: nsTeamNoShow,
    total_taken_place: nsTakenPlace,
    show_rate: nsTakenPlace > 0 ? (nsShowed / nsTakenPlace) * 100 : null,
  };

  // Offers and closes filtered by scope
  const offerRows = offers.filter(o => {
    if (!inRange(o.offered_at, from, to)) return false;
    return offerMatchesScope(o.offer_type, offerScope);
  });

  const closeRows = closes.filter(c => {
    if (!inRange(c.closed_at, from, to)) return false;
    return offerMatchesScope(c.offer_type, offerScope);
  });

  const cash = closeRows.reduce((s, c) => s + Number(c.cash_collected ?? 0), 0);

  const uniqueLeadsWithIntro = new Set(introsBooked.map(a => a.lead_id).filter(Boolean));

  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  const cost = (den: number) => (den > 0 && spend > 0 ? spend / den : null);

  return {
    ad_spend: spend,
    leads: leadsInRange.length,
    meta_leads: metaLeads.length,
    intros_booked: introsBooked.length,
    intros_showed: introsShowed.length,
    intros_taken_place: introsTakenPlace.length,
    demos_booked: demosBooked.length,
    demos_showed: demosShowed.length,
    demos_taken_place: demosTakenPlace.length,
    offers_made: offerRows.length,
    closes: closeRows.length,
    cash_collected: cash,
    intro_booking_rate: rate(uniqueLeadsWithIntro.size, leadsInRange.length),
    intro_show_rate: rate(introsShowed.length, introsTakenPlace.length),
    demo_booking_rate: rate(demosBooked.length, introsShowed.length),
    demo_show_rate: rate(demosShowed.length, demosTakenPlace.length),
    offer_rate: rate(offerRows.length, demosShowed.length),
    close_rate: rate(closeRows.length, offerRows.length),
    demo_to_close_rate: rate(closeRows.length, demosShowed.length),
    cpl: cost(costLeadDenominator),
    cost_per_intro: cost(introsBooked.length),
    cost_per_intro_showed: cost(introsShowed.length),
    cost_per_demo_booked: cost(demosBooked.length),
    cost_per_demo_showed: cost(demosShowed.length),
    cost_per_offer: cost(offerRows.length),
    cac: cost(closeRows.length),
    no_show_breakdown,
    cost_per_no_show: cost(nsLeadNoShow),
  };
}
