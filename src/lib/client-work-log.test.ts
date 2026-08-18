import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkType,
  parseWorkType,
  resolveWorkLogDates,
  shouldFreezeBaseline,
  isBetWorkType,
  workLogPlotDate,
  isGhostMark,
  parseLayerToggles,
  DEFAULT_LAYER_TOGGLES,
} from './client-work-log';

describe('work type', () => {
  it('accepts finding, cadence, bet', () => {
    assert.equal(isWorkType('finding'), true);
    assert.equal(isWorkType('cadence'), true);
    assert.equal(isWorkType('bet'), true);
    assert.equal(isWorkType('hygiene'), false);
    assert.equal(parseWorkType('nope', 'cadence'), 'cadence');
  });

  it('treats missing work_type as bet for backfill', () => {
    assert.equal(isBetWorkType(null), true);
    assert.equal(isBetWorkType(undefined), true);
    assert.equal(isBetWorkType('cadence'), false);
  });
});

describe('resolveWorkLogDates', () => {
  const today = '2026-08-18';

  it('stamps observed date on findings', () => {
    assert.deepEqual(
      resolveWorkLogDates({
        workType: 'finding',
        status: 'in_progress',
        changeDate: null,
        plannedDate: null,
        today,
      }),
      { changeDate: today, plannedDate: null },
    );
  });

  it('keeps planned bets from going live', () => {
    assert.deepEqual(
      resolveWorkLogDates({
        workType: 'bet',
        status: 'planned',
        changeDate: today,
        plannedDate: null,
        today,
      }),
      { changeDate: null, plannedDate: today },
    );
  });

  it('uses explicit live date for in-progress bets', () => {
    assert.deepEqual(
      resolveWorkLogDates({
        workType: 'bet',
        status: 'in_progress',
        changeDate: '2026-08-10',
        plannedDate: '2026-08-01',
        today,
      }),
      { changeDate: '2026-08-10', plannedDate: '2026-08-01' },
    );
  });

  it('defaults cadence done date to today', () => {
    assert.deepEqual(
      resolveWorkLogDates({
        workType: 'cadence',
        status: 'in_progress',
        changeDate: null,
        plannedDate: '2026-08-17',
        today,
      }),
      { changeDate: today, plannedDate: '2026-08-17' },
    );
  });
});

describe('shouldFreezeBaseline', () => {
  it('freezes only live bets', () => {
    assert.equal(shouldFreezeBaseline('bet', '2026-08-18', 'in_progress'), true);
    assert.equal(shouldFreezeBaseline('bet', null, 'planned'), false);
    assert.equal(shouldFreezeBaseline('bet', '2026-08-18', 'planned'), false);
    assert.equal(shouldFreezeBaseline('cadence', '2026-08-18', 'in_progress'), false);
    assert.equal(shouldFreezeBaseline('finding', '2026-08-18', 'in_progress'), false);
  });
});

describe('plot date', () => {
  it('prefers live date then planned', () => {
    assert.equal(workLogPlotDate({ change_date: '2026-08-10', planned_date: '2026-08-01' }), '2026-08-10');
    assert.equal(workLogPlotDate({ change_date: null, planned_date: '2026-08-01' }), '2026-08-01');
    assert.equal(isGhostMark({ change_date: null }), true);
    assert.equal(isGhostMark({ change_date: '2026-08-10' }), false);
  });
});

describe('layer toggles', () => {
  it('defaults bets on, others off', () => {
    assert.deepEqual(parseLayerToggles(null), DEFAULT_LAYER_TOGGLES);
    assert.equal(parseLayerToggles('{"cadence":true}').cadence, true);
    assert.equal(parseLayerToggles('{"cadence":true}').bet, true);
    assert.equal(parseLayerToggles('not-json').finding, false);
  });
});
