/**
 * Load per-client KPI snapshots for Client Compare.
 * Calendar window only — no matured-grading clamp.
 */

import {
  compareRowFromMetrics,
  isDefaultRosterClient,
  type ClientCompareRow,
} from '@/lib/client-compare';
import {
  groupEventsByClient,
  groupSpendByClient,
  type ClientEventWithDate,
  type ClientKpiBenchmarks,
} from '@/lib/client-health';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import type { EventRow } from '@/lib/metrics';
import {
  emptySqlKpiCounts,
  metricsFromSqlCounts,
  parseSqlKpiCountsByClient,
  type SqlKpiCounts,
} from '@/lib/metrics-from-sql';
import type { createServiceClient } from '@/lib/supabase';

const EVENT_SELECT =
  'client_id, occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name';

type ServiceClient = ReturnType<typeof createServiceClient>;

type ClientRow = {
  id: string;
  name: string;
  reporting_type: string | null;
  lifecycle_status: string | null;
  billing_paused: boolean | null;
  kpi_benchmarks: unknown;
};

function isoBound(start: string, end: string) {
  return {
    p_start: `${start}T00:00:00.000Z`,
    p_end: `${end}T23:59:59.999Z`,
  };
}

async function fetchCountsByClient(
  service: ServiceClient,
  start: string,
  end: string,
): Promise<Map<string, SqlKpiCounts> | null> {
  const { p_start, p_end } = isoBound(start, end);
  const { data, error } = await service.rpc('dashboard_kpi_counts_by_client', {
    p_client_ids: null,
    p_start,
    p_end,
  });
  if (error) {
    if (/dashboard_kpi_counts_by_client|Could not find the function|schema cache/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  return parseSqlKpiCountsByClient(data);
}

async function fetchMetaSpend(
  service: ServiceClient,
  start: string,
  end: string,
): Promise<Array<{ client_id: string; amount: number; platform?: string }>> {
  const { data, error } = await service
    .from('daily_meta_spend')
    .select('client_id, spend_date, amount')
    .gte('spend_date', start)
    .lte('spend_date', end);
  if (error) throw error;
  return (data ?? []).map(r => ({
    client_id: String(r.client_id),
    amount: Number(r.amount),
    platform: 'meta',
  }));
}

function includeClient(c: ClientRow, extraIds: Set<string>): boolean {
  if (extraIds.has(c.id)) return true;
  return isDefaultRosterClient({
    lifecycle_status: c.lifecycle_status,
    billing_paused: c.billing_paused,
  });
}

export type ClientCompareBundle = {
  period: { start: string; end: string };
  clients: ClientCompareRow[];
};

export async function loadClientCompareBundle(
  service: ServiceClient,
  opts: { start: string; end: string; extraIds?: string[] },
): Promise<ClientCompareBundle> {
  const extraIds = new Set((opts.extraIds ?? []).filter(Boolean));

  const { data: clients, error: clientsError } = await service
    .from('clients')
    .select('id, name, reporting_type, lifecycle_status, billing_paused, kpi_benchmarks')
    .order('name');
  if (clientsError) throw new Error(clientsError.message);

  const roster = ((clients ?? []) as ClientRow[]).filter(c => includeClient(c, extraIds));

  const [countsMap, spendRows] = await Promise.all([
    fetchCountsByClient(service, opts.start, opts.end),
    fetchMetaSpend(service, opts.start, opts.end),
  ]);

  const spendByClient = groupSpendByClient(spendRows);

  if (countsMap) {
    const rows = roster.map(c => {
      const spend = spendByClient.get(c.id) ?? [];
      const metrics = metricsFromSqlCounts(countsMap.get(c.id) ?? emptySqlKpiCounts(), spend);
      return compareRowFromMetrics({
        id: c.id,
        name: c.name,
        reporting_type: normalizeReportingType(c.reporting_type),
        lifecycle_status: c.lifecycle_status,
        billing_paused: c.billing_paused,
        metrics,
        benchmarks: (c.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null,
      });
    });
    return { period: { start: opts.start, end: opts.end }, clients: rows };
  }

  const { data: events, error: eventsError } = await service
    .from('events')
    .select(EVENT_SELECT)
    .gte('occurred_at', `${opts.start}T00:00:00.000Z`)
    .lte('occurred_at', `${opts.end}T23:59:59.999Z`)
    .limit(200000);
  if (eventsError) throw new Error(eventsError.message);

  const byClient = groupEventsByClient((events ?? []) as ClientEventWithDate[]);
  const { calculateMetrics } = await import('@/lib/metrics');

  const rows = roster.map(c => {
    const spend = spendByClient.get(c.id) ?? [];
    const clientEvents = (byClient.get(c.id) ?? []) as EventRow[];
    return compareRowFromMetrics({
      id: c.id,
      name: c.name,
      reporting_type: normalizeReportingType(c.reporting_type),
      lifecycle_status: c.lifecycle_status,
      billing_paused: c.billing_paused,
      metrics: calculateMetrics(clientEvents, spend),
      benchmarks: (c.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null,
    });
  });

  return { period: { start: opts.start, end: opts.end }, clients: rows };
}
