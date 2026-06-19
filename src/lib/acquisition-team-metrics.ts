// Per-setter funnel rollup for the Acquisition KPI dashboard.

import { META_FUNNEL_EXCLUDED_TYPES } from './acquisition-config';
import { inRange, tookPlace, offerMatchesScope, type OfferScope } from './acquisition-metrics';
import type { AcquisitionAppointmentRow, AcquisitionOfferRow, AcquisitionCloseRow } from './acquisition-metrics';

export type SetterRow = {
  setter: string;
  intros_booked: number;
  intros_showed: number;
  intros_taken_place: number;
  intro_show_rate: number | null;
  demos_booked: number;
  demos_showed: number;
  demos_taken_place: number;
  demo_show_rate: number | null;
  /** Intros showed → demos booked conversion */
  is_to_db_rate: number | null;
  offers: number;
  closes: number;
  close_rate: number | null;
  cash_collected: number;
};

export type SetterMetricsInput = {
  appointments: AcquisitionAppointmentRow[];
  offers: AcquisitionOfferRow[];
  closes: AcquisitionCloseRow[];
  from: string;
  to: string;
  offerScope?: OfferScope;
  setterFilter?: string | null;
};

export function calculateSetterMetrics(input: SetterMetricsInput): SetterRow[] {
  const { appointments, offers, closes, from, to, offerScope = 'core', setterFilter } = input;

  const appts = appointments.filter(a => !META_FUNNEL_EXCLUDED_TYPES.has(a.appointment_type));

  type Bucket = {
    intros_booked: number;
    intros_showed: number;
    intros_taken_place: number;
    demos_booked: number;
    demos_showed: number;
    demos_taken_place: number;
    offers: number;
    closes: number;
    cash: number;
  };

  const bySetter = new Map<string, Bucket>();

  const getBucket = (setter: string): Bucket => {
    if (!bySetter.has(setter)) {
      bySetter.set(setter, {
        intros_booked: 0, intros_showed: 0, intros_taken_place: 0,
        demos_booked: 0, demos_showed: 0, demos_taken_place: 0,
        offers: 0, closes: 0, cash: 0,
      });
    }
    return bySetter.get(setter)!;
  };

  for (const a of appts) {
    const setter = a.setter_name?.trim();
    if (!setter || setter === '2') continue;
    if (setterFilter && setter.toLowerCase() !== setterFilter.toLowerCase()) continue;

    // Self-booked demos excluded from leaderboard per ACQUISITION_KPIS.md
    const selfBooked = (a.how_booked ?? '').toLowerCase().includes('customer');

    if (a.appointment_type === 'intro') {
      const b = getBucket(setter);
      if (inRange(a.booked_at, from, to)) b.intros_booked++;
      if (inRange(a.scheduled_at, from, to)) {
        if (a.status === 'showed') b.intros_showed++;
        if (tookPlace(a.status)) b.intros_taken_place++;
      }
    } else if (a.appointment_type === 'demo' && !selfBooked) {
      const b = getBucket(setter);
      if (inRange(a.booked_at, from, to)) b.demos_booked++;
      if (inRange(a.scheduled_at, from, to)) {
        if (a.status === 'showed') b.demos_showed++;
        if (tookPlace(a.status)) b.demos_taken_place++;
      }
    }
  }

  for (const o of offers) {
    if (!inRange(o.offered_at, from, to)) continue;
    if (!offerMatchesScope(o.offer_type, offerScope)) continue;
    const setter = o.setter_name?.trim();
    if (!setter) continue;
    if (setterFilter && setter.toLowerCase() !== setterFilter.toLowerCase()) continue;
    getBucket(setter).offers++;
  }

  for (const c of closes) {
    if (!inRange(c.closed_at, from, to)) continue;
    if (!offerMatchesScope(c.offer_type, offerScope)) continue;
    // Closes don't always have setter_name; skip for setter attribution
    const setter = (c as { setter_name?: string | null }).setter_name?.trim();
    if (!setter) continue;
    if (setterFilter && setter.toLowerCase() !== setterFilter.toLowerCase()) continue;
    const b = getBucket(setter);
    b.closes++;
    b.cash += Number((c as { cash_collected?: number | null }).cash_collected ?? 0);
  }

  const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);

  return [...bySetter.entries()]
    .map(([setter, b]) => ({
      setter,
      intros_booked: b.intros_booked,
      intros_showed: b.intros_showed,
      intros_taken_place: b.intros_taken_place,
      intro_show_rate: rate(b.intros_showed, b.intros_taken_place),
      demos_booked: b.demos_booked,
      demos_showed: b.demos_showed,
      demos_taken_place: b.demos_taken_place,
      demo_show_rate: rate(b.demos_showed, b.demos_taken_place),
      is_to_db_rate: rate(b.demos_booked, b.intros_showed),
      offers: b.offers,
      closes: b.closes,
      close_rate: rate(b.closes, b.offers),
      cash_collected: b.cash,
    }))
    .sort((a, b) => b.intros_booked - a.intros_booked);
}
