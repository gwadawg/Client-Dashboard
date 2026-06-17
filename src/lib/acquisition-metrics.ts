// Acquisition funnel KPI engine — mirrors business-metrics.ts / metrics.ts pattern.

import {
  DOWNSELL_OFFER_TYPES,
  isMetaLeadSource,
  META_FUNNEL_EXCLUDED_TYPES,
  type AcquisitionApptStatus,
} from './acquisition-config';

export type DateMode = 'booked' | 'scheduled' | 'lead_created' | 'offered';

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
};

export type AcquisitionAdSpendRow = {
  insight_date: string;
  amount_spent: number;
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
  /** Include Skool, Mid Offer, Bootcamp in offer/close counts */
  includeDownsells?: boolean;
  /** Filter to Meta leads only for denominators */
  metaOnly?: boolean;
  setterFilter?: string | null;
};

export type AcquisitionMetricsResult = {
  ad_spend: number;
  leads: number;
  meta_leads: number;
  intros_booked: number;
  intros_showed: number;
  demos_booked: number;
  demos_showed: number;
  offers_made: number;
  closes: number;
  intro_booking_rate: number | null;
  intro_show_rate: number | null;
  demo_booking_rate: number | null;
  demo_show_rate: number | null;
  offer_rate: number | null;
  close_rate: number | null;
  cpl: number | null;
  cost_per_intro: number | null;
  cost_per_demo_showed: number | null;
  cost_per_offer: number | null;
  cac: number | null;
};

function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= from && d <= to;
}

function apptDate(row: AcquisitionAppointmentRow, mode: DateMode): string | null {
  if (mode === 'booked') return row.booked_at;
  if (mode === 'scheduled') return row.scheduled_at;
  return row.booked_at ?? row.scheduled_at;
}

function isDownsellOffer(offerType: string): boolean {
  return DOWNSELL_OFFER_TYPES.has(offerType) || DOWNSELL_OFFER_TYPES.has(offerType.toLowerCase());
}

function tookPlace(status: string): boolean {
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
    includeDownsells = false,
    metaOnly = true,
  } = input;

  const spend = adSpend
    .filter(r => inRange(r.insight_date, from, to))
    .reduce((s, r) => s + Number(r.amount_spent ?? 0), 0);

  const leadsInRange = leads.filter(l => inRange(l.created_at, from, to));
  const metaLeads = leadsInRange.filter(l => isMetaLeadSource(l.source));
  const leadDenominator = metaOnly ? metaLeads.length : leadsInRange.length;

  const appts = appointments.filter(a => !META_FUNNEL_EXCLUDED_TYPES.has(a.appointment_type));

  const introsBooked = appts.filter(
    a => a.appointment_type === 'intro' && inRange(a.booked_at, from, to),
  );
  const introsShowed = appts.filter(
    a => a.appointment_type === 'intro' && a.status === 'showed' && inRange(a.scheduled_at, from, to),
  );
  const introsTakenPlace = appts.filter(
    a => a.appointment_type === 'intro' && tookPlace(a.status) && inRange(a.scheduled_at, from, to),
  );

  const demosBooked = appts.filter(
    a => a.appointment_type === 'demo' && inRange(a.booked_at, from, to),
  );
  const demosShowed = appts.filter(
    a => a.appointment_type === 'demo' && a.status === 'showed' && inRange(a.scheduled_at, from, to),
  );
  const demosTakenPlace = appts.filter(
    a => a.appointment_type === 'demo' && tookPlace(a.status) && inRange(a.scheduled_at, from, to),
  );

  const offerRows = offers.filter(o => {
    if (!inRange(o.offered_at, from, to)) return false;
    if (!includeDownsells && isDownsellOffer(o.offer_type)) return false;
    return true;
  });

  const closeRows = closes.filter(c => {
    if (!inRange(c.closed_at, from, to)) return false;
    if (!includeDownsells && c.offer_type && isDownsellOffer(c.offer_type)) return false;
    return true;
  });

  const uniqueLeadsWithIntro = new Set(introsBooked.map(a => a.lead_id).filter(Boolean));

  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  const cost = (den: number) => (den > 0 && spend > 0 ? spend / den : null);

  return {
    ad_spend: spend,
    leads: leadsInRange.length,
    meta_leads: metaLeads.length,
    intros_booked: introsBooked.length,
    intros_showed: introsShowed.length,
    demos_booked: demosBooked.length,
    demos_showed: demosShowed.length,
    offers_made: offerRows.length,
    closes: closeRows.length,
    intro_booking_rate: rate(uniqueLeadsWithIntro.size, leadsInRange.length),
    intro_show_rate: rate(introsShowed.length, introsTakenPlace.length),
    demo_booking_rate: rate(demosBooked.length, introsShowed.length),
    demo_show_rate: rate(demosShowed.length, demosTakenPlace.length),
    offer_rate: rate(offerRows.length, demosShowed.length),
    close_rate: rate(closeRows.length, offerRows.length),
    cpl: cost(leadDenominator),
    cost_per_intro: cost(introsBooked.length),
    cost_per_demo_showed: cost(demosShowed.length),
    cost_per_offer: cost(offerRows.length),
    cac: cost(closeRows.length),
  };
}
