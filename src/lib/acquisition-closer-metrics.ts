// Per-closer funnel rollup for the Acquisition KPI dashboard.
// Closers are identified via acquisition_calls.handled_by on demo-type calls.

import { inRange, tookPlace, offerMatchesScope, type OfferScope } from './acquisition-metrics';
import type { AcquisitionOfferRow, AcquisitionCloseRow } from './acquisition-metrics';
import { isReportingClose } from './acquisition-close-filter';

export type CloserCallRow = {
  id: string;
  call_type: string;
  called_at: string;
  status: string | null;
  handled_by: string | null;
  appointment_id: string | null;
  details?: Record<string, unknown> | null;
};

export type CloserRow = {
  closer: string;
  demos_ran: number;
  demos_showed: number;
  demo_show_rate: number | null;
  offers: number;
  offer_rate: number | null;
  closes: number;
  close_rate: number | null;
  cash_collected: number;
  avg_call_rating: number | null;
};

export type CloserMetricsInput = {
  calls: CloserCallRow[];
  offers: AcquisitionOfferRow[];
  closes: AcquisitionCloseRow[];
  from: string;
  to: string;
  offerScope?: OfferScope;
  closerFilter?: string | null;
};

export function calculateCloserMetrics(input: CloserMetricsInput): CloserRow[] {
  const { calls, offers, closes, from, to, offerScope = 'core', closerFilter } = input;

  type Bucket = {
    demos_ran: number;
    demos_showed: number;
    offers: number;
    closes: number;
    cash: number;
    rating_sum: number;
    rating_count: number;
  };

  const byCloser = new Map<string, Bucket>();

  const getBucket = (closer: string): Bucket => {
    if (!byCloser.has(closer)) {
      byCloser.set(closer, {
        demos_ran: 0, demos_showed: 0, offers: 0, closes: 0,
        cash: 0, rating_sum: 0, rating_count: 0,
      });
    }
    return byCloser.get(closer)!;
  };

  // Calls on demo-type appointments
  for (const c of calls) {
    if (c.call_type !== 'closer' && c.call_type !== 'demo') continue;
    if (!inRange(c.called_at, from, to)) continue;
    const closer = c.handled_by?.trim();
    if (!closer) continue;
    if (closerFilter && closer.toLowerCase() !== closerFilter.toLowerCase()) continue;

    const b = getBucket(closer);
    b.demos_ran++;
    if (c.status === 'showed') b.demos_showed++;

    const rating = (c.details as { call_rating?: number } | null)?.call_rating;
    if (typeof rating === 'number' && rating >= 1 && rating <= 10) {
      b.rating_sum += rating;
      b.rating_count++;
    }
  }

  // Map offers to closers via appointment_id → call.appointment_id
  // Build a quick map of appointment_id → closer
  const apptToCloser = new Map<string, string>();
  for (const c of calls) {
    const closer = c.handled_by?.trim();
    if (!closer || !c.appointment_id) continue;
    apptToCloser.set(c.appointment_id, closer);
  }

  for (const o of offers) {
    if (!inRange(o.offered_at, from, to)) continue;
    if (!offerMatchesScope(o.offer_type, offerScope)) continue;
    const closer = o.appointment_id ? apptToCloser.get(o.appointment_id) : undefined;
    if (!closer) continue;
    if (closerFilter && closer.toLowerCase() !== closerFilter.toLowerCase()) continue;
    getBucket(closer).offers++;
  }

  for (const c of closes) {
    if (!isReportingClose(c)) continue;
    if (!inRange(c.closed_at, from, to)) continue;
    if (!offerMatchesScope(c.offer_type, offerScope)) continue;
    const callId = (c as { call_id?: string | null }).call_id;
    // Try to resolve closer via call_id if available, fallback to offer link
    const closer = callId
      ? [...byCloser.keys()].find(k => k) // already bucketed via calls
      : undefined;
    // When we have appointment linkage, use that
    const offerLink = [...offers].find(o => {
      if (!inRange(o.offered_at, from, to)) return false;
      return o.lead_id === c.lead_id && offerMatchesScope(o.offer_type, offerScope);
    });
    const resolvedCloser = offerLink?.appointment_id
      ? apptToCloser.get(offerLink.appointment_id)
      : undefined;
    if (!resolvedCloser) continue;
    if (closerFilter && resolvedCloser.toLowerCase() !== closerFilter.toLowerCase()) continue;
    const b = getBucket(resolvedCloser);
    b.closes++;
    b.cash += Number((c as { cash_collected?: number | null }).cash_collected ?? 0);
  }

  const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);

  return [...byCloser.entries()]
    .map(([closer, b]) => ({
      closer,
      demos_ran: b.demos_ran,
      demos_showed: b.demos_showed,
      demo_show_rate: rate(b.demos_showed, b.demos_ran),
      offers: b.offers,
      offer_rate: rate(b.offers, b.demos_showed),
      closes: b.closes,
      close_rate: rate(b.closes, b.offers),
      cash_collected: b.cash,
      avg_call_rating: b.rating_count > 0 ? b.rating_sum / b.rating_count : null,
    }))
    .sort((a, b) => b.demos_ran - a.demos_ran);
}
