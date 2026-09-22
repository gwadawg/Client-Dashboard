import type { SupabaseClient } from '@supabase/supabase-js';

export type ScheduledAlertSlackSkipReason =
  | 'dry_run'
  | 'no_breaches'
  | 'no_triggered'
  | 'no_active_clients'
  | 'slack_not_configured'
  | 'channel_missing'
  | 'disabled'
  | null;

/** Shared return shape for every scheduled digest alert. */
export type ScheduledAlertResult = {
  ok: boolean;
  alert_id: string;
  event_key: string;
  scanned: number;
  triggered: number;
  window: { start: string; end: string } | null;
  channel_slug: string | null;
  slack_posted: boolean;
  slack_skipped_reason: ScheduledAlertSlackSkipReason;
  slack_error: string | null;
  details: Record<string, unknown>;
};

export type ScheduledAlertRunOpts = {
  today?: string;
  dryRun?: boolean;
  postAllClear?: boolean;
};

export type ScheduledAlertDefinition = {
  id: string;
  event_key: string;
  name: string;
  /** When false, the daily runner skips this alert. */
  enabled: boolean;
  run: (
    service: SupabaseClient,
    opts: ScheduledAlertRunOpts,
  ) => Promise<ScheduledAlertResult>;
};

export type DailyAlertsRunResult = {
  ok: boolean;
  run_at: string;
  dry_run: boolean;
  results: ScheduledAlertResult[];
};
