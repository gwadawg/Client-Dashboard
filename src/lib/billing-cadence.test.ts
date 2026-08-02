import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePerformanceAmount } from './billing-model';
import {
  dueDateForMonth,
  isCadenceLocked,
  isCadencePending,
  openCadenceMonths,
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
  });

  it('clamps due day to month length', () => {
    assert.equal(dueDateForMonth(2026, 1, 31), '2026-02-28'); // Feb
    assert.equal(dueDateForMonth(2026, 0, 31), '2026-01-31');
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

  it('bills shows + live transfers as conversations', () => {
    const amount = computePerformanceAmount(
      { show_count: 10, live_transfer_count: 5, bailed_count: 2 },
      { pay_per_show: 30, pay_per_bailed: 30 },
    );
    assert.equal(amount, 15 * 30 + 2 * 30);
  });
});
