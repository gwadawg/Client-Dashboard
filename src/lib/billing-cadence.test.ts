import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePerformanceAmount } from './billing-model';
import {
  cadenceSetupHint,
  dueDateForMonth,
  isCadenceLocked,
  isCadencePending,
  openCadenceMonths,
  periodBoundsForMonth,
} from './billing-cadence';

describe('billing-cadence', () => {
  it('locks fixed clients with billing_day', () => {
    assert.equal(isCadenceLocked({ billing_model: 'fixed', billing_day: 5, mrr: 1500 }), true);
    assert.equal(isCadencePending({ billing_model: 'fixed', billing_day: null }), true);
  });

  it('locks performance when day + a rate exist', () => {
    assert.equal(
      isCadenceLocked({ billing_model: 'performance', billing_day: 1, pay_per_show: 30 }),
      true,
    );
    assert.equal(
      isCadenceLocked({ billing_model: 'performance', billing_day: 1 }),
      false,
    );
    assert.match(
      cadenceSetupHint({ billing_model: 'performance', pay_per_show: 30 }) ?? '',
      /due day/i,
    );
  });

  it('clamps due day to month length', () => {
    assert.equal(dueDateForMonth(2026, 1, 31), '2026-02-28'); // Feb
    assert.equal(dueDateForMonth(2026, 0, 31), '2026-01-31');
  });

  it('uses anniversary period windows from billing day', () => {
    assert.deepEqual(periodBoundsForMonth(2026, 4, 26), {
      periodStart: '2026-04-26',
      periodEnd: '2026-05-25',
    });
    assert.deepEqual(periodBoundsForMonth(2026, 4, 1), {
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
    });
  });

  it('keeps late months open alongside the current month', () => {
    const today = new Date(Date.UTC(2026, 7, 2)); // Aug 2, 2026
    const open = openCadenceMonths(
      { billing_model: 'fixed', billing_day: 1, launch_date: '2026-06-01' },
      {
        today,
        billings: [
          // June paid — July and August still open
          { due_date: '2026-06-01', billed_on: '2026-06-01', status: 'paid' },
        ],
        lookbackMonths: 3,
      },
    );
    const months = open.map(m => m.yearMonth);
    assert.ok(months.includes('2026-07'));
    assert.ok(months.includes('2026-08'));
    assert.equal(open[0]!.dueDate, '2026-07-01');
  });

  it('settles performance history from paid ledger (not only cycles)', () => {
    const today = new Date(Date.UTC(2026, 7, 2)); // Aug 2, 2026
    const open = openCadenceMonths(
      {
        billing_model: 'performance',
        billing_day: 1,
        pay_per_show: 30,
        launch_date: '2026-02-01',
      },
      {
        today,
        billings: [
          { billed_on: '2026-06-15', status: 'paid' },
          { billed_on: '2026-07-10', status: 'paid' },
        ],
        cycles: [],
        lookbackMonths: 6,
      },
    );
    const months = open.map(m => m.yearMonth);
    // Feb–May must not reappear behind paid June/July
    assert.ok(!months.includes('2026-02'));
    assert.ok(!months.includes('2026-05'));
    assert.ok(!months.includes('2026-07')); // covered by paid billed_on
    assert.ok(months.includes('2026-08'));
  });

  it('does not invent paid coverage for months after last payment', () => {
    const today = new Date(Date.UTC(2026, 7, 2));
    const open = openCadenceMonths(
      { billing_model: 'fixed', billing_day: 5, launch_date: '2026-05-01' },
      {
        today,
        billings: [{ due_date: '2026-06-05', billed_on: '2026-06-05', status: 'paid' }],
        lookbackMonths: 6,
      },
    );
    const months = open.map(m => m.yearMonth);
    assert.ok(months.includes('2026-07'));
    assert.ok(months.includes('2026-08'));
    assert.ok(!months.includes('2026-05'));
  });

  it('skips launch month — first payment is on sign, not launch', () => {
    const today = new Date(Date.UTC(2026, 7, 2)); // Aug 2
    const open = openCadenceMonths(
      { billing_model: 'fixed', billing_day: 15, launch_date: '2026-06-10', date_signed: '2026-05-20' },
      { today, billings: [], lookbackMonths: 6 },
    );
    const months = open.map(m => m.yearMonth);
    assert.ok(!months.includes('2026-05')); // sign month
    assert.ok(!months.includes('2026-06')); // launch month — no collection
    assert.ok(months.includes('2026-07')); // first recurring
    assert.ok(months.includes('2026-08'));
  });

  it('bills shows + live transfers as conversations', () => {
    const amount = computePerformanceAmount(
      { show_count: 10, live_transfer_count: 5, bailed_count: 2 },
      { pay_per_show: 30, pay_per_bailed: 30 },
    );
    assert.equal(amount, 15 * 30 + 2 * 30);
  });
});
