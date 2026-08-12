import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calendarDuration,
  describeClientTenure,
  formatDurationParts,
  formatYmdLabel,
} from './client-tenure';

describe('formatYmdLabel', () => {
  it('formats a date-only ISO string without timezone shift', () => {
    assert.equal(formatYmdLabel('2026-03-12'), 'Mar 12, 2026');
  });
});

describe('calendarDuration', () => {
  it('counts whole months and leftover days', () => {
    assert.deepEqual(calendarDuration('2026-01-10', '2026-04-25'), {
      years: 0,
      months: 3,
      days: 15,
      totalDays: 105,
    });
  });

  it('borrows days across month boundaries', () => {
    assert.deepEqual(calendarDuration('2026-01-31', '2026-03-01'), {
      years: 0,
      months: 1,
      days: 1,
      totalDays: 29,
    });
  });

  it('includes years', () => {
    assert.deepEqual(calendarDuration('2024-08-11', '2026-08-11'), {
      years: 2,
      months: 0,
      days: 0,
      totalDays: 730,
    });
  });
});

describe('formatDurationParts', () => {
  it('omits zero units and pluralizes', () => {
    assert.equal(formatDurationParts({ years: 0, months: 4, days: 1 }), '4 months, 1 day');
    assert.equal(formatDurationParts({ years: 1, months: 0, days: 0 }), '1 year');
    assert.equal(formatDurationParts({ years: 0, months: 0, days: 0 }), '0 days');
  });
});

describe('describeClientTenure', () => {
  it('reports live tenure and engagement month from launch', () => {
    const view = describeClientTenure(
      { launch_date: '2026-01-11', lifecycle_status: 'active' },
      '2026-08-11',
    );
    assert.equal(view.phase, 'live');
    assert.equal(view.launchLabel, 'Jan 11, 2026');
    assert.equal(view.liveLabel, '7 months');
    assert.equal(view.engagementMonth, 8);
    assert.equal(view.sinceLaunchAvailable, true);
    assert.equal(view.daysLive, 212);
  });

  it('treats a future launch as prelaunch', () => {
    const view = describeClientTenure(
      { launch_date: '2026-09-01', date_signed: '2026-07-01' },
      '2026-08-11',
    );
    assert.equal(view.phase, 'prelaunch');
    assert.equal(view.sinceLaunchAvailable, false);
    assert.match(view.liveLabel, /Goes live in/);
  });

  it('uses churned_at as the live end date', () => {
    const view = describeClientTenure(
      {
        launch_date: '2026-01-01',
        churned_at: '2026-04-01T15:00:00.000Z',
        lifecycle_status: 'churned',
      },
      '2026-08-11',
    );
    assert.equal(view.phase, 'churned');
    assert.equal(view.liveLabel, 'Was live 3 months');
    assert.equal(view.daysLive, 90);
  });

  it('falls back to signed when launch is missing', () => {
    const view = describeClientTenure(
      { date_signed: '2026-06-01', lifecycle_status: 'onboarding' },
      '2026-08-11',
    );
    assert.equal(view.phase, 'signed');
    assert.equal(view.signedLabel, 'Jun 1, 2026');
    assert.equal(view.liveLabel, 'Not launched yet');
    assert.equal(view.sinceLaunchAvailable, false);
  });
});
