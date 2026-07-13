// Acquisition funnel KPI engine — mirrors business-metrics.ts / metrics.ts pattern.

import {
  isMetaLeadSource,
  META_FUNNEL_EXCLUDED_TYPES,
  type AcquisitionApptStatus,
} from './acquisition-config';
import { offerMatchesScope as catalogOfferMatchesScope, type OfferScope } from './offer-catalog';
import { isReportingClose } from './acquisition-close-filter';
import { normalizeAcquisitionLeadSource } from './acquisition-lead-source';
import {
  META_ATTRIBUTED_CHANNELS,
  NON_MEDIA_ACQUISITION_CHANNELS,
  resolveAcquisitionCostChannel,
  type AcquisitionCostChannel,
} from './expenses';

export type DateMode = 'booked' | 'scheduled' | 'lead_created' | 'offered';

export type { OfferScope };

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
  mapping_status?: string | null;
};

export type AcquisitionAdSpendRow = {
  insight_date: string;
  amount_spent?: number;
  spend?: number;
};

/** Non-media CAC ledger rows (creative, labor, referral, paid_other). */
export type AcquisitionLedgerCostRow = {
  occurred_on: string;
  amount: number;
  acquisition_cost_channel?: string | null;
  subcategory?: string | null;
  merchant_raw?: string | null;
  merchant_normalized?: string | null;
  source?: string | null;
  ceo_bucket?: string | null;
  exclude_from_pnl?: boolean | null;
};

export type CostByChannel = {
  meta_media: number;
  creative_production: number;
  paid_other: number;
  referral_partner: number;
  acquisition_labor: number;
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
  /** Optional ledger CAC (non-media) for all-in / blended formulas. */
  ledgerCosts?: AcquisitionLedgerCostRow[];
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
  /** Non-media CAC from expense ledger in range. */
  non_media_cac: number;
  /** Meta media + non-media CAC. */
  all_in_spend: number;
  /** Spend attributed to Meta all-in (media + creative/labor/paid_other). */
  meta_all_in_spend: number;
  cost_by_channel: CostByChannel;
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
  /**
   * Blended All-in CAC = (Meta media + non-media CAC) ÷ all closes.
   * Kept as `cac` for API compat; UI should label "Blended All-in CAC".
   */
  cac: number | null;
  /** Meta Media CAC = Meta spend ÷ Meta closes. */
  meta_cac: number | null;
  /** Meta All-in CAC = (Meta + Meta-attributed ledger) ÷ Meta closes. */
  meta_all_in_cac: number | null;
  /** Referral CAC = referral_partner spend ÷ Referral closes. */
  referral_cac: number | null;
  /** Closes in range with a Meta-sourced lead (offer-scoped). */
  meta_closes: number;
  referral_closes: number;
  no_show_breakdown: NoShowBreakdown;
  cost_per_no_show: number | null;
};

export function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= from && d <= to;
}

export function offerMatchesScope(offerType: string | null, scope: OfferScope): boolean {
  return catalogOfferMatchesScope(offerType, scope);
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
    ledgerCosts = [],
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
    .reduce((s, r) => s + Number(r.amount_spent ?? r.spend ?? 0), 0);

  const cost_by_channel: CostByChannel = {
    meta_media: spend,
    creative_production: 0,
    paid_other: 0,
    referral_partner: 0,
    acquisition_labor: 0,
  };

  for (const row of ledgerCosts) {
    if (!inRange(row.occurred_on, from, to)) continue;
    if (row.ceo_bucket && row.ceo_bucket !== 'cac') continue;
    const channel = resolveAcquisitionCostChannel({
      ceo_bucket: 'cac',
      acquisition_cost_channel: row.acquisition_cost_channel,
      subcategory: row.subcategory,
      merchant_raw: row.merchant_raw,
      merchant_normalized: row.merchant_normalized,
      source: row.source,
    }) as AcquisitionCostChannel | null;
    if (!channel || channel === 'meta_media') continue;
    if (!NON_MEDIA_ACQUISITION_CHANNELS.has(channel)) continue;
    const amt = Math.abs(Number(row.amount) || 0);
    cost_by_channel[channel] += amt;
  }

  const non_media_cac =
    cost_by_channel.creative_production +
    cost_by_channel.paid_other +
    cost_by_channel.referral_partner +
    cost_by_channel.acquisition_labor;
  const meta_attributed_ledger = [...META_ATTRIBUTED_CHANNELS].reduce(
    (s, ch) => s + cost_by_channel[ch],
    0,
  );
  const all_in_spend = spend + non_media_cac;
  const meta_all_in_spend = spend + meta_attributed_ledger;

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
    if (!isReportingClose(c)) return false;
    if (!inRange(c.closed_at, from, to)) return false;
    return offerMatchesScope(c.offer_type, offerScope);
  });

  // Lead source lookup — include leads outside the created_at window so closes
  // can still be attributed to Meta (lead may have been created earlier).
  const leadSourceById = new Map(leads.map(l => [l.id, l.source]));
  const metaCloseRows = closeRows.filter(c =>
    c.lead_id != null && isMetaLeadSource(leadSourceById.get(c.lead_id) ?? null),
  );
  const referralCloseRows = closeRows.filter(c => {
    if (!c.lead_id) return false;
    return normalizeAcquisitionLeadSource(leadSourceById.get(c.lead_id) ?? null) === 'Referral';
  });

  const cash = closeRows.reduce((s, c) => s + Number(c.cash_collected ?? 0), 0);

  const uniqueLeadsWithIntro = new Set(introsBooked.map(a => a.lead_id).filter(Boolean));

  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  const cost = (den: number) => (den > 0 && spend > 0 ? spend / den : null);
  const costWith = (num: number, den: number) => (den > 0 && num > 0 ? num / den : null);

  return {
    ad_spend: spend,
    non_media_cac,
    all_in_spend,
    meta_all_in_spend,
    cost_by_channel,
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
    cac: costWith(all_in_spend, closeRows.length),
    meta_cac: cost(metaCloseRows.length),
    meta_all_in_cac: costWith(meta_all_in_spend, metaCloseRows.length),
    referral_cac: costWith(cost_by_channel.referral_partner, referralCloseRows.length),
    meta_closes: metaCloseRows.length,
    referral_closes: referralCloseRows.length,
    no_show_breakdown,
    cost_per_no_show: cost(nsLeadNoShow),
  };
}
