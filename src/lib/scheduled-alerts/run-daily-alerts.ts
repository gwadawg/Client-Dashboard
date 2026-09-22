import type { SupabaseClient } from '@supabase/supabase-js';
import { DAILY_SCHEDULED_ALERTS } from '@/lib/scheduled-alerts/registry';
import type {
  DailyAlertsRunResult,
  ScheduledAlertRunOpts,
} from '@/lib/scheduled-alerts/types';

export type RunDailyAlertsOpts = ScheduledAlertRunOpts & {
  /** Run only these alert ids. Defaults to all enabled alerts. */
  only?: string[];
};

export async function runDailyAlerts(
  service: SupabaseClient,
  opts: RunDailyAlertsOpts = {},
): Promise<DailyAlertsRunResult> {
  const dryRun = opts.dryRun === true;
  const onlySet = opts.only?.length ? new Set(opts.only) : null;

  const alerts = DAILY_SCHEDULED_ALERTS.filter(alert => {
    if (!alert.enabled) return false;
    if (onlySet && !onlySet.has(alert.id)) return false;
    return true;
  });

  const results = [];
  for (const alert of alerts) {
    const result = await alert.run(service, {
      today: opts.today,
      dryRun,
      postAllClear: opts.postAllClear,
    });
    results.push(result);
  }

  return {
    ok: results.every(r => r.ok),
    run_at: new Date().toISOString(),
    dry_run: dryRun,
    results,
  };
}
