// Daily time-series buckets for acquisition trend charts.

import { isMetaLeadSource, META_FUNNEL_EXCLUDED_TYPES } from './acquisition-config';
import { isReportingClose } from './acquisition-close-filter';
import { inRange, offerMatchesScope, type OfferScope } from './acquisition-metrics';
import type {
  AcquisitionLeadRow,
  AcquisitionAppointmentRow,
  AcquisitionAdSpendRow,
  AcquisitionCloseRow,
} from './acquisition-metrics';

export type AcquisitionTimeseriesBucket = {
  date: string; // YYYY-MM-DD
  leads: number;
  meta_leads: number;
  intros_showed: number;
  demos_showed: number;
  closes: number;
  ad_spend: number;
  cpl: number | null;
};

export type TimeseriesInput = {
  leads: AcquisitionLeadRow[];
  appointments: AcquisitionAppointmentRow[];
  closes: AcquisitionCloseRow[];
  adSpend: AcquisitionAdSpendRow[];
  from: string;
  to: string;
  offerScope?: OfferScope;
};

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function calculateAcquisitionTimeseries(input: TimeseriesInput): AcquisitionTimeseriesBucket[] {
  const { leads, appointments, closes, adSpend, from, to, offerScope = 'core' } = input;

  const dates = dateRange(from, to);

  const appts = appointments.filter(a => !META_FUNNEL_EXCLUDED_TYPES.has(a.appointment_type));

  type Bucket = {
    leads: number;
    meta_leads: number;
    intros_showed: number;
    demos_showed: number;
    closes: number;
    ad_spend: number;
  };

  const buckets = new Map<string, Bucket>();
  for (const d of dates) {
    buckets.set(d, { leads: 0, meta_leads: 0, intros_showed: 0, demos_showed: 0, closes: 0, ad_spend: 0 });
  }

  for (const l of leads) {
    const d = l.created_at?.slice(0, 10);
    if (!d || !buckets.has(d)) continue;
    const b = buckets.get(d)!;
    b.leads++;
    if (isMetaLeadSource(l.source)) b.meta_leads++;
  }

  for (const a of appts) {
    const d = a.scheduled_at?.slice(0, 10);
    if (!d || !buckets.has(d)) continue;
    const b = buckets.get(d)!;
    if (a.appointment_type === 'intro' && a.status === 'showed') b.intros_showed++;
    if (a.appointment_type === 'demo' && a.status === 'showed') b.demos_showed++;
  }

  for (const c of closes) {
    if (!isReportingClose(c)) continue;
    const d = c.closed_at?.slice(0, 10);
    if (!d || !buckets.has(d)) continue;
    if (!offerMatchesScope(c.offer_type, offerScope)) continue;
    buckets.get(d)!.closes++;
  }

  for (const s of adSpend) {
    const d = s.insight_date?.slice(0, 10);
    if (!d || !buckets.has(d)) continue;
    buckets.get(d)!.ad_spend += Number(s.amount_spent ?? s.spend ?? 0);
  }

  return dates.map(d => {
    const b = buckets.get(d)!;
    return {
      date: d,
      leads: b.leads,
      meta_leads: b.meta_leads,
      intros_showed: b.intros_showed,
      demos_showed: b.demos_showed,
      closes: b.closes,
      ad_spend: b.ad_spend,
      cpl: b.meta_leads > 0 && b.ad_spend > 0 ? b.ad_spend / b.meta_leads : null,
    };
  });
}
