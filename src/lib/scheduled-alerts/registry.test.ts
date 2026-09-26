import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAILY_SCHEDULED_ALERTS, getScheduledAlert } from '@/lib/scheduled-alerts/registry';
import { CPL_THRESHOLD_ALERT_ID } from '@/lib/scheduled-alerts/cpl-threshold';
import { DAILY_KPI_REFRESH_ALERT_ID } from '@/lib/scheduled-alerts/events-daily-kpi-refresh';

describe('scheduled alerts registry', () => {
  it('registers the CPL threshold alert as enabled', () => {
    assert.ok(DAILY_SCHEDULED_ALERTS.length >= 1);
    const cpl = getScheduledAlert(CPL_THRESHOLD_ALERT_ID);
    assert.ok(cpl);
    assert.equal(cpl?.enabled, true);
    assert.equal(cpl?.event_key, 'kpi.cpl.threshold_breached');
  });

  it('registers events_daily_kpi refresh', () => {
    const alert = getScheduledAlert(DAILY_KPI_REFRESH_ALERT_ID);
    assert.ok(alert);
    assert.equal(alert?.enabled, true);
  });
});
