/**
 * Daily CPL threshold alert for media buyers.
 * Active live clients whose Ad Spend ÷ Leads over the window exceeds the threshold
 * are posted as one digest to the media_buyer Slack team channel.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { liveClientFilter } from '@/lib/db-helpers';
import { usesCallCenterKpiLayout, normalizeReportingType } from '@/lib/kpi-layouts';
import {
  emptySqlKpiCounts,
  parseSqlKpiCountsByClient,
  type SqlKpiCounts,
} from '@/lib/metrics-from-sql';
import { isSlackConfigured, postToTeamChannel } from '@/lib/slack-notify';

export const CPL_THRESHOLD_EVENT_KEY = 'kpi.cpl.threshold_breached';

export const CPL_THRESHOLD_DEFAULTS = {
  thresholdUsd: 35,
  /** Inclusive calendar days ending today (e.g. 4 → today + 3 prior days). */
  windowDays: 4,
  channelSlug: 'media_buyer',
  /** Skip HE / call-center layouts — they are not graded on CPL. */
  excludeCallCenter: true,
} as const;

export type CplBreachRow = {
  client_id: string;
  client_name: string;
  cpl: number;
  leads: number;
  ad_spend: number;
};

export type CplThresholdAlertResult = {
  ok: boolean;
  start: string;
  end: string;
  threshold: number;
  channel_slug: string;
  scanned: number;
  breaches: CplBreachRow[];
  slack_posted: boolean;
  slack_skipped_reason: string | null;
  slack_error: string | null;
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`);
  const d = new Date(t + deltaDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Inclusive window ending on `todayYmd`. */
export function cplAlertDateWindow(
  todayYmd: string,
  windowDays: number = CPL_THRESHOLD_DEFAULTS.windowDays,
): { start: string; end: string } {
  const days = Math.max(1, Math.floor(windowDays));
  return {
    start: addDaysYmd(todayYmd, -(days - 1)),
    end: todayYmd,
  };
}

export function computeCpl(adSpend: number, leads: number): number | null {
  if (!(leads > 0)) return null;
  if (!Number.isFinite(adSpend) || adSpend < 0) return null;
  return adSpend / leads;
}

export function selectCplBreaches(
  rows: Array<{
    client_id: string;
    client_name: string;
    leads: number;
    ad_spend: number;
  }>,
  thresholdUsd: number,
): CplBreachRow[] {
  const out: CplBreachRow[] = [];
  for (const row of rows) {
    const cpl = computeCpl(row.ad_spend, row.leads);
    if (cpl == null || !(cpl > thresholdUsd)) continue;
    out.push({
      client_id: row.client_id,
      client_name: row.client_name,
      cpl,
      leads: row.leads,
      ad_spend: row.ad_spend,
    });
  }
  out.sort((a, b) => b.cpl - a.cpl || a.client_name.localeCompare(b.client_name));
  return out;
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

export function formatCplThresholdSlackMessage(payload: {
  start: string;
  end: string;
  threshold: number;
  windowDays?: number;
  breaches: CplBreachRow[];
}): string {
  const { start, end, threshold, breaches } = payload;
  const windowDays = payload.windowDays ?? CPL_THRESHOLD_DEFAULTS.windowDays;
  if (breaches.length === 0) {
    return [
      `✅ *CPL check* — no active clients over ${formatUsd(threshold)}`,
      `Window: ${start} → ${end} (${windowDays}d)`,
      '',
      '_Posted by Mr. Waiz_',
    ].join('\n');
  }

  const lines = [
    `⚠️ *CPL over ${formatUsd(threshold)}* — ${breaches.length} active client${breaches.length === 1 ? '' : 's'}`,
    `Window: ${start} → ${end} (past ${windowDays} days)`,
    '',
  ];

  for (const b of breaches) {
    lines.push(
      `• *${b.client_name}* — CPL ${formatUsd(b.cpl)} (${formatUsd(b.ad_spend)} ÷ ${b.leads} lead${b.leads === 1 ? '' : 's'})`,
    );
  }

  lines.push('', '_Posted by Mr. Waiz_');
  return lines.join('\n');
}

async function fetchLeadCountsByClient(
  service: SupabaseClient,
  clientIds: string[],
  start: string,
  end: string,
): Promise<Map<string, SqlKpiCounts>> {
  const { data, error } = await service.rpc('dashboard_kpi_counts_by_client', {
    p_client_ids: liveClientFilter(clientIds),
    p_start: `${start}T00:00:00.000Z`,
    p_end: `${end}T23:59:59.999Z`,
  });
  if (error) {
    if (/dashboard_kpi_counts_by_client|Could not find the function|schema cache/i.test(error.message)) {
      return fetchLeadCountsFromEvents(service, clientIds, start, end);
    }
    throw new Error(error.message);
  }
  return parseSqlKpiCountsByClient(data);
}

async function fetchLeadCountsFromEvents(
  service: SupabaseClient,
  clientIds: string[],
  start: string,
  end: string,
): Promise<Map<string, SqlKpiCounts>> {
  const map = new Map<string, SqlKpiCounts>();
  for (const id of clientIds) map.set(id, emptySqlKpiCounts());

  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await service
      .from('events')
      .select('client_id')
      .eq('event_type', 'lead')
      .in('client_id', liveClientFilter(clientIds))
      .gte('occurred_at', `${start}T00:00:00.000Z`)
      .lte('occurred_at', `${end}T23:59:59.999Z`)
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      const id = String(row.client_id);
      const counts = map.get(id) ?? emptySqlKpiCounts();
      counts.new_leads += 1;
      map.set(id, counts);
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return map;
}

async function fetchSpendByClient(
  service: SupabaseClient,
  clientIds: string[],
  start: string,
  end: string,
): Promise<Map<string, number>> {
  const spend = new Map<string, number>();
  let q = service.from('daily_meta_spend').select('client_id, amount');
  q = q.in('client_id', liveClientFilter(clientIds));
  q = q.gte('spend_date', start);
  q = q.lte('spend_date', end);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const id = String(row.client_id);
    spend.set(id, (spend.get(id) ?? 0) + Number(row.amount));
  }
  return spend;
}

export type RunCplThresholdAlertOpts = {
  today?: string;
  thresholdUsd?: number;
  windowDays?: number;
  channelSlug?: string;
  /** When true, still compute breaches but skip Slack (and skip empty "all clear" posts). */
  dryRun?: boolean;
  /** When false, do not post the "all clear" digest. Default false (alert only on breaches). */
  postAllClear?: boolean;
};

export async function runCplThresholdAlert(
  service: SupabaseClient,
  opts: RunCplThresholdAlertOpts = {},
): Promise<CplThresholdAlertResult> {
  const threshold = opts.thresholdUsd ?? CPL_THRESHOLD_DEFAULTS.thresholdUsd;
  const windowDays = opts.windowDays ?? CPL_THRESHOLD_DEFAULTS.windowDays;
  const channelSlug = opts.channelSlug ?? CPL_THRESHOLD_DEFAULTS.channelSlug;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const { start, end } = cplAlertDateWindow(today, windowDays);
  const dryRun = opts.dryRun === true;
  const postAllClear = opts.postAllClear === true;

  const { data: clients, error: clientsError } = await service
    .from('clients')
    .select('id, name, is_live, lifecycle_status, reporting_type')
    .eq('is_live', true)
    .eq('lifecycle_status', 'active')
    .order('name');

  if (clientsError) throw new Error(clientsError.message);

  const eligible = (clients ?? []).filter(c => {
    if (CPL_THRESHOLD_DEFAULTS.excludeCallCenter) {
      const rt = normalizeReportingType(c.reporting_type);
      if (usesCallCenterKpiLayout(rt)) return false;
    }
    return true;
  });

  const clientIds = eligible.map(c => c.id as string);
  if (clientIds.length === 0) {
    return {
      ok: true,
      start,
      end,
      threshold,
      channel_slug: channelSlug,
      scanned: 0,
      breaches: [],
      slack_posted: false,
      slack_skipped_reason: 'no_active_clients',
      slack_error: null,
    };
  }

  const [countsMap, spendMap] = await Promise.all([
    fetchLeadCountsByClient(service, clientIds, start, end),
    fetchSpendByClient(service, clientIds, start, end),
  ]);

  const metricRows = eligible.map(c => {
    const id = c.id as string;
    const leads = countsMap.get(id)?.new_leads ?? 0;
    const ad_spend = spendMap.get(id) ?? 0;
    return {
      client_id: id,
      client_name: String(c.name),
      leads,
      ad_spend,
    };
  });

  const breaches = selectCplBreaches(metricRows, threshold);

  if (dryRun) {
    return {
      ok: true,
      start,
      end,
      threshold,
      channel_slug: channelSlug,
      scanned: eligible.length,
      breaches,
      slack_posted: false,
      slack_skipped_reason: 'dry_run',
      slack_error: null,
    };
  }

  if (breaches.length === 0 && !postAllClear) {
    return {
      ok: true,
      start,
      end,
      threshold,
      channel_slug: channelSlug,
      scanned: eligible.length,
      breaches,
      slack_posted: false,
      slack_skipped_reason: 'no_breaches',
      slack_error: null,
    };
  }

  if (!isSlackConfigured()) {
    return {
      ok: true,
      start,
      end,
      threshold,
      channel_slug: channelSlug,
      scanned: eligible.length,
      breaches,
      slack_posted: false,
      slack_skipped_reason: 'slack_not_configured',
      slack_error: null,
    };
  }

  const text = formatCplThresholdSlackMessage({
    start,
    end,
    threshold,
    windowDays,
    breaches,
  });
  const result = await postToTeamChannel(service, channelSlug, text);

  if (!result) {
    return {
      ok: true,
      start,
      end,
      threshold,
      channel_slug: channelSlug,
      scanned: eligible.length,
      breaches,
      slack_posted: false,
      slack_skipped_reason: 'channel_missing',
      slack_error: null,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      start,
      end,
      threshold,
      channel_slug: channelSlug,
      scanned: eligible.length,
      breaches,
      slack_posted: false,
      slack_skipped_reason: null,
      slack_error: result.error,
    };
  }

  return {
    ok: true,
    start,
    end,
    threshold,
    channel_slug: channelSlug,
    scanned: eligible.length,
    breaches,
    slack_posted: true,
    slack_skipped_reason: null,
    slack_error: null,
  };
}
