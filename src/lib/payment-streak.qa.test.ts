/**
 * Fixture QA: derive dispositions for sample client shapes that mirror
 * Admin Billing dispositions (paid, extension, pause). Run with:
 *   npx tsx --test src/lib/payment-streak.qa.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientStreakTimeline, type StreakBillingRow } from './payment-streak';

const today = new Date('2026-08-10T12:00:00.000Z');

describe('QA fixtures vs Admin Billing shapes', () => {
  it('active full-freight book: three paid months → streak 3, M3 badge', () => {
    const billings: StreakBillingRow[] = [
      {
        id: 'pay-1',
        billed_on: '2026-06-03',
        period_start: '2026-06-01',
        amount: 2500,
        amount_paid: 2500,
        status: 'paid',
      },
      {
        id: 'pay-2',
        billed_on: '2026-07-03',
        period_start: '2026-07-01',
        amount: 2500,
        amount_paid: 2500,
        status: 'paid',
      },
      {
        id: 'pay-3',
        billed_on: '2026-08-03',
        period_start: '2026-08-01',
        amount: 2500,
        amount_paid: 2500,
        status: 'paid',
      },
    ];
    const tl = buildClientStreakTimeline({
      client: { lifecycle_status: 'active' },
      billings,
      from: '2026-06',
      to: '2026-08',
      today,
    });
    assert.deepEqual(
      tl.months.map((m) => m.disposition),
      ['paid', 'paid', 'paid'],
    );
    assert.equal(tl.summary.current_streak, 3);
    assert.equal(tl.summary.milestone_m3, true);
    assert.equal(tl.summary.milestone_m6, false);
  });

  it('extension month ($0 is_extension) is yellow and breaks streak after prior pays', () => {
    const billings: StreakBillingRow[] = [
      {
        id: 'a',
        billed_on: '2026-05-01',
        amount: 3000,
        amount_paid: 3000,
        status: 'paid',
      },
      {
        id: 'b',
        billed_on: '2026-06-01',
        amount: 3000,
        amount_paid: 3000,
        status: 'paid',
      },
      {
        id: 'ext',
        billed_on: '2026-07-01',
        amount: 0,
        amount_paid: 0,
        status: 'paid',
        is_extension: true,
      },
    ];
    const tl = buildClientStreakTimeline({
      client: { lifecycle_status: 'active' },
      billings,
      from: '2026-05',
      to: '2026-07',
      today,
    });
    assert.equal(tl.months[2]?.disposition, 'extension');
    assert.equal(tl.summary.current_streak, 0);
    assert.equal(tl.summary.total_extensions, 1);
  });

  it('billing_paused without open ledger months paints gray from pause month', () => {
    const billings: StreakBillingRow[] = [
      {
        id: 'last',
        billed_on: '2026-05-01',
        amount: 2000,
        amount_paid: 2000,
        status: 'paid',
      },
    ];
    const tl = buildClientStreakTimeline({
      client: {
        lifecycle_status: 'active',
        billing_paused: true,
        billing_paused_at: '2026-06-15T00:00:00.000Z',
      },
      billings,
      from: '2026-05',
      to: '2026-08',
      today,
    });
    const byYm = Object.fromEntries(tl.months.map((m) => [m.year_month, m.disposition]));
    assert.equal(byYm['2026-05'], 'paid');
    assert.equal(byYm['2026-06'], 'paused');
    assert.equal(byYm['2026-07'], 'paused');
    assert.equal(byYm['2026-08'], 'paused');
    assert.equal(tl.summary.at_risk, true);
  });

  it('overdue unpaid month is red and zeros streak', () => {
    const billings: StreakBillingRow[] = [
      {
        id: 'ok',
        billed_on: '2026-06-01',
        amount: 2500,
        amount_paid: 2500,
        status: 'paid',
      },
      {
        id: 'late',
        billed_on: '2026-07-01',
        due_date: '2026-07-05',
        amount: 2500,
        amount_paid: 0,
        status: 'overdue',
      },
    ];
    const tl = buildClientStreakTimeline({
      client: { lifecycle_status: 'active' },
      billings,
      from: '2026-06',
      to: '2026-07',
      today,
    });
    assert.equal(tl.months[1]?.disposition, 'unpaid');
    assert.equal(tl.summary.current_streak, 0);
    assert.equal(tl.summary.total_misses, 1);
  });
});
