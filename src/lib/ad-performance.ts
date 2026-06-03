import { buildContactKey, eventPhone } from '@/lib/contact-key';

// Minimal shapes (decoupled from the full EventRow / meta_ad_insights row).
export type AdMetaRow = {
  client_id?: string | null;
  ad_name?: string | null;
  insight_date?: string | null;
  spend?: number | string | null;
  impressions?: number | string | null;
  clicks?: number | string | null;
};

export type AdEventRow = {
  client_id?: string | null;
  event_type: string;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  phone_number_used?: string | null;
  ad_name?: string | null;
  is_qualified?: boolean | null;
  is_hot?: boolean | null;
  occurred_at?: string | null;
};

export type AdPerformanceRow = {
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cost_per_appointment: number | null;
  cost_per_show: number | null;
  cost_per_close: number | null;
  booking_rate: number | null;
  show_rate: number | null;
  client_count: number;
  has_meta: boolean;
};

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Trim only; same ad names are reused across clients, so casing is left intact. */
export function normalizeAdName(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

/** Lower-cased grouping key so trivial casing differences fold together. */
function adKey(name: string): string {
  return name.toLowerCase();
}

type Acc = {
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  clients: Set<string>;
  has_meta: boolean;
};

function blankAcc(displayName: string): Acc {
  return {
    ad_name: displayName,
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    qualified: 0,
    hot: 0,
    appointments: 0,
    shows: 0,
    no_shows: 0,
    closes: 0,
    clients: new Set<string>(),
    has_meta: false,
  };
}

/**
 * Maps each contact (per client) to the ad name on its lead event, so downstream
 * events (appointments / shows / closes) that don't carry an ad name themselves
 * can still be attributed back to the ad that produced the lead.
 */
function buildContactAdMap(events: AdEventRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) {
    if (e.event_type !== 'lead') continue;
    const name = normalizeAdName(e.ad_name);
    if (!name) continue;
    const key = buildContactKey(
      e.client_id ?? '',
      eventPhone(e),
      e.ghl_contact_id,
    );
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

/** Resolve the ad name for any event: its own ad_name, else its contact's lead ad. */
function resolveEventAdName(e: AdEventRow, contactAd: Map<string, string>): string | null {
  const own = normalizeAdName(e.ad_name);
  if (own) return own;
  const key = buildContactKey(e.client_id ?? '', eventPhone(e), e.ghl_contact_id);
  return contactAd.get(key) ?? null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function round(v: number | null, dp = 2): number | null {
  if (v == null) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/**
 * Global, cross-client ad leaderboard grouped by ad name. Spend / platform
 * metrics come from meta_ad_insights; the funnel (leads → qualified → appts →
 * shows → closes) is attributed from our own events.
 */
export function aggregateAdPerformance(
  metaRows: AdMetaRow[],
  events: AdEventRow[],
): AdPerformanceRow[] {
  const accs = new Map<string, Acc>();

  const ensure = (displayName: string): Acc => {
    const key = adKey(displayName);
    let acc = accs.get(key);
    if (!acc) {
      acc = blankAcc(displayName);
      accs.set(key, acc);
    }
    return acc;
  };

  // 1. Meta spend / platform metrics.
  for (const m of metaRows) {
    const name = normalizeAdName(m.ad_name);
    if (!name) continue;
    const acc = ensure(name);
    acc.spend += num(m.spend);
    acc.impressions += num(m.impressions);
    acc.clicks += num(m.clicks);
    acc.has_meta = true;
    if (m.client_id) acc.clients.add(m.client_id);
  }

  // 2. Attributed funnel from events.
  const contactAd = buildContactAdMap(events);
  for (const e of events) {
    const name = resolveEventAdName(e, contactAd);
    if (!name) continue;
    const acc = ensure(name);
    if (e.client_id) acc.clients.add(e.client_id);

    switch (e.event_type) {
      case 'lead':
        acc.leads += 1;
        if (e.is_qualified) acc.qualified += 1;
        if (e.is_hot) acc.hot += 1;
        break;
      case 'appointment_booked':
        acc.appointments += 1;
        break;
      case 'show':
        acc.shows += 1;
        break;
      case 'no_show':
        acc.no_shows += 1;
        break;
      case 'loan_funded':
        acc.closes += 1;
        break;
    }
  }

  const rows: AdPerformanceRow[] = [];
  for (const acc of accs.values()) {
    rows.push({
      ad_name: acc.ad_name,
      spend: round(acc.spend) ?? 0,
      impressions: acc.impressions,
      clicks: acc.clicks,
      ctr: round(ratio(acc.clicks, acc.impressions) != null ? (acc.clicks / acc.impressions) * 100 : null, 2),
      cpc: round(ratio(acc.spend, acc.clicks), 2),
      cpm: round(acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : null, 2),
      leads: acc.leads,
      qualified: acc.qualified,
      hot: acc.hot,
      appointments: acc.appointments,
      shows: acc.shows,
      no_shows: acc.no_shows,
      closes: acc.closes,
      cpl: round(ratio(acc.spend, acc.leads), 2),
      cost_per_qualified: round(ratio(acc.spend, acc.qualified), 2),
      cost_per_appointment: round(ratio(acc.spend, acc.appointments), 2),
      cost_per_show: round(ratio(acc.spend, acc.shows), 2),
      cost_per_close: round(ratio(acc.spend, acc.closes), 2),
      booking_rate: round(ratio(acc.appointments, acc.qualified) != null ? (acc.appointments / acc.qualified) * 100 : null, 1),
      show_rate: round(
        acc.shows + acc.no_shows > 0 ? (acc.shows / (acc.shows + acc.no_shows)) * 100 : null,
        1,
      ),
      client_count: acc.clients.size,
      has_meta: acc.has_meta,
    });
  }

  // Default ordering: biggest spenders first (UI can re-sort).
  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

export type AdClientBreakdownRow = {
  client_id: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  closes: number;
  cpl: number | null;
  cost_per_show: number | null;
};

export type AdDailyPoint = {
  date: string;
  spend: number;
  leads: number;
  appointments: number;
  shows: number;
};

export type AdDrilldown = {
  ad_name: string;
  perClient: AdClientBreakdownRow[];
  daily: AdDailyPoint[];
};

/** Per-client breakdown + daily trend for one ad name. */
export function buildAdDrilldown(
  adName: string,
  metaRows: AdMetaRow[],
  events: AdEventRow[],
): AdDrilldown {
  const target = adKey(adName);
  const contactAd = buildContactAdMap(events);

  const perClient = new Map<string, AdClientBreakdownRow>();
  const ensureClient = (clientId: string): AdClientBreakdownRow => {
    let row = perClient.get(clientId);
    if (!row) {
      row = {
        client_id: clientId,
        spend: 0,
        leads: 0,
        qualified: 0,
        appointments: 0,
        shows: 0,
        closes: 0,
        cpl: null,
        cost_per_show: null,
      };
      perClient.set(clientId, row);
    }
    return row;
  };

  const daily = new Map<string, AdDailyPoint>();
  const ensureDay = (date: string): AdDailyPoint => {
    let p = daily.get(date);
    if (!p) {
      p = { date, spend: 0, leads: 0, appointments: 0, shows: 0 };
      daily.set(date, p);
    }
    return p;
  };

  for (const m of metaRows) {
    const name = normalizeAdName(m.ad_name);
    if (!name || adKey(name) !== target) continue;
    const spend = num(m.spend);
    if (m.client_id) ensureClient(m.client_id).spend += spend;
    if (m.insight_date) ensureDay(m.insight_date.slice(0, 10)).spend += spend;
  }

  for (const e of events) {
    const name = resolveEventAdName(e, contactAd);
    if (!name || adKey(name) !== target) continue;
    const day = e.occurred_at ? e.occurred_at.slice(0, 10) : null;
    const client = e.client_id ? ensureClient(e.client_id) : null;
    const dayPoint = day ? ensureDay(day) : null;

    switch (e.event_type) {
      case 'lead':
        if (client) {
          client.leads += 1;
          if (e.is_qualified) client.qualified += 1;
        }
        if (dayPoint) dayPoint.leads += 1;
        break;
      case 'appointment_booked':
        if (client) client.appointments += 1;
        if (dayPoint) dayPoint.appointments += 1;
        break;
      case 'show':
        if (client) client.shows += 1;
        if (dayPoint) dayPoint.shows += 1;
        break;
      case 'loan_funded':
        if (client) client.closes += 1;
        break;
    }
  }

  for (const row of perClient.values()) {
    row.spend = round(row.spend) ?? 0;
    row.cpl = round(ratio(row.spend, row.leads), 2);
    row.cost_per_show = round(ratio(row.spend, row.shows), 2);
  }

  return {
    ad_name: adName,
    perClient: [...perClient.values()].sort((a, b) => b.spend - a.spend),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
