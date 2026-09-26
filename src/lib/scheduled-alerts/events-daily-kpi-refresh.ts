/**
 * Nightly refresh of events_daily_kpi for yesterday (UTC).
 * Additive day buckets for analytics; dashboard unique rates still use live RPC / range cache.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ScheduledAlertResult,
  ScheduledAlertRunOpts,
} from '@/lib/scheduled-alerts/types';

export const DAILY_KPI_REFRESH_ALERT_ID = 'events-daily-kpi-refresh';
export const DAILY_KPI_REFRESH_EVENT_KEY = 'scheduled.events_daily_kpi_refresh';

function yesterdayUtcYmd(todayYmd: string): string {
  const d = new Date(`${todayYmd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function emptyResult(
  partial: Partial<ScheduledAlertResult> & Pick<ScheduledAlertResult, 'ok'>,
): ScheduledAlertResult {
  return {
    alert_id: DAILY_KPI_REFRESH_ALERT_ID,
    event_key: DAILY_KPI_REFRESH_EVENT_KEY,
    scanned: 0,
    triggered: 0,
    window: null,
    channel_slug: null,
    slack_posted: false,
    slack_skipped_reason: 'no_triggered',
    slack_error: null,
    details: {},
    ...partial,
  };
}

export async function runEventsDailyKpiRefreshScheduledAlert(
  service: SupabaseClient,
  opts: ScheduledAlertRunOpts = {},
): Promise<ScheduledAlertResult> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const day = yesterdayUtcYmd(today);

  if (opts.dryRun) {
    return emptyResult({
      ok: true,
      window: { start: day, end: day },
      slack_skipped_reason: 'dry_run',
      details: { would_refresh: day },
    });
  }

  const { data, error } = await service.rpc('refresh_events_daily_kpi', {
    p_start: day,
    p_end: day,
  });

  if (error) {
    return emptyResult({
      ok: false,
      window: { start: day, end: day },
      slack_error: error.message,
      details: { day, error: error.message },
    });
  }

  const rows = typeof data === 'number' ? data : Number(data ?? 0);
  return emptyResult({
    ok: true,
    scanned: 1,
    triggered: 1,
    window: { start: day, end: day },
    slack_skipped_reason: 'no_triggered',
    details: { day, client_day_rows: rows },
  });
}
