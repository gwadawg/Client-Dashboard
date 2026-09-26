import type { ScheduledAlertDefinition } from '@/lib/scheduled-alerts/types';
import {
  CPL_THRESHOLD_ALERT_ID,
  CPL_THRESHOLD_EVENT_KEY,
  runCplThresholdScheduledAlert,
} from '@/lib/scheduled-alerts/cpl-threshold';
import {
  MB_MORNING_DIGEST_ALERT_ID,
  MB_MORNING_DIGEST_EVENT_KEY,
  runMbMorningDigestScheduledAlert,
} from '@/lib/scheduled-alerts/mb-morning-digest';
import {
  DAILY_KPI_REFRESH_ALERT_ID,
  DAILY_KPI_REFRESH_EVENT_KEY,
  runEventsDailyKpiRefreshScheduledAlert,
} from '@/lib/scheduled-alerts/events-daily-kpi-refresh';

/** Daily digest alerts — add new entries here. */
export const DAILY_SCHEDULED_ALERTS: ScheduledAlertDefinition[] = [
  {
    id: CPL_THRESHOLD_ALERT_ID,
    event_key: CPL_THRESHOLD_EVENT_KEY,
    name: 'CPL over $35 (past 4 days)',
    enabled: true,
    run: runCplThresholdScheduledAlert,
  },
  {
    id: MB_MORNING_DIGEST_ALERT_ID,
    event_key: MB_MORNING_DIGEST_EVENT_KEY,
    name: 'Media Buyer morning digest',
    enabled: true,
    run: runMbMorningDigestScheduledAlert,
  },
  {
    id: DAILY_KPI_REFRESH_ALERT_ID,
    event_key: DAILY_KPI_REFRESH_EVENT_KEY,
    name: 'Refresh events_daily_kpi (yesterday UTC)',
    enabled: true,
    run: runEventsDailyKpiRefreshScheduledAlert,
  },
];

export function getScheduledAlert(id: string): ScheduledAlertDefinition | undefined {
  return DAILY_SCHEDULED_ALERTS.find(alert => alert.id === id);
}
