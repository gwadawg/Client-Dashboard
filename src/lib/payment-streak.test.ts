import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsYm,
  billingYearMonth,
  buildClientStreakTimeline,
  computeCurrentStreak,
  dispositionFromBilling,
  monthRangeInclusive,
  summarizeStreak,
  yearMonthFromDate,
  type MonthCell,
  type StreakBillingRow,
} from './payment-streak';

describe('yearMonth helpers', () => {
  it('parses dates and ISO timestamps', () => {
    assert.equal(yearMonthFromDate('2026-07-15'), '2026-07');
    assert.equal(yearMonthFromDate('2026-07-15T12:00:00.000Z'), '2026-07');
    assert.equal(yearMonthFromDate(null), null);
  });

  it('prefers period_start for billing month', () => {
    assert.equal(
      billingYearMonth({
        billed_on: '2026-08-01',
        period_start: '2026-07-01',
        amount: 100,
      }),
      '2026-07',
    );
  });

  it('builds inclusive month ranges', () => {
    assert.deepEqual(monthRangeInclusive('2026-01', '2026-03'), [
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    assert.equal(addMonthsYm('2026-12', 1), '2027-01');
  });
});

describe('dispositionFromBilling', () => {
  const today = new Date('2026-08-10T12:00:00.000Z');

  it('marks extension yellow state', () => {
    assert.equal(
      dispositionFromBilling(
        {
          billed_on: '2026-07-01',
          amount: 0,
          amount_paid: 0,
          status: 'paid',
          is_extension: true,
        },
        today,
      ),
      'extension',
    );
  });

  it('marks full freight paid', () => {
    assert.equal(
      dispositionFromBilling(
        {
          billed_on: '2026-07-01',
          amount: 2500,
          amount_paid: 2500,
          status: 'paid',
        },
        today,
      ),
      'paid',
    );
  });

  it('marks short pay', () => {
    assert.equal(
      dispositionFromBilling(
        {
          billed_on: '2026-07-01',
          due_date: '2026-07-05',
          amount: 2500,
          amount_paid: 1000,
          status: 'partial',
        },
        today,
      ),
      'short',
    );
  });

  it('marks overdue unpaid', () => {
    assert.equal(
      dispositionFromBilling(
        {
          billed_on: '2026-06-01',
          due_date: '2026-06-05',
          amount: 2500,
          amount_paid: 0,
          status: 'pending',
        },
        today,
      ),
      'unpaid',
    );
  });

  it('ignores voided as empty', () => {
    assert.equal(
      dispositionFromBilling(
        {
          billed_on: '2026-07-01',
          amount: 2500,
          amount_paid: 0,
          status: 'voided',
        },
        today,
      ),
      'empty',
    );
  });
});

function cells(
  seq: Array<[string, MonthCell['disposition'], MonthCell['source']?]>,
): MonthCell[] {
  return seq.map(([year_month, disposition, source]) => ({
    year_month,
    disposition,
    ledger_disposition: disposition,
    source: source ?? 'derived',
    billing_id: null,
    amount: null,
    amount_paid: null,
    is_extension: disposition === 'extension',
    note: null,
  }));
}

describe('computeCurrentStreak', () => {
  it('counts trailing paid months', () => {
    const m = cells([
      ['2026-01', 'paid'],
      ['2026-02', 'paid'],
      ['2026-03', 'paid'],
    ]);
    assert.equal(computeCurrentStreak(m), 3);
  });

  it('breaks on extension', () => {
    const m = cells([
      ['2026-01', 'paid'],
      ['2026-02', 'paid'],
      ['2026-03', 'extension'],
      ['2026-04', 'paid'],
    ]);
    assert.equal(computeCurrentStreak(m), 1);
  });

  it('breaks on unpaid and short', () => {
    assert.equal(
      computeCurrentStreak(
        cells([
          ['2026-01', 'paid'],
          ['2026-02', 'unpaid'],
          ['2026-03', 'paid'],
        ]),
      ),
      1,
    );
    assert.equal(
      computeCurrentStreak(
        cells([
          ['2026-01', 'paid'],
          ['2026-02', 'short'],
        ]),
      ),
      0,
    );
  });

  it('breaks on pause', () => {
    assert.equal(
      computeCurrentStreak(
        cells([
          ['2026-01', 'paid'],
          ['2026-02', 'paid'],
          ['2026-03', 'paused'],
        ]),
      ),
      0,
    );
  });
});

describe('buildClientStreakTimeline', () => {
  const today = new Date('2026-08-15T12:00:00.000Z');

  const billings: StreakBillingRow[] = [
    {
      id: 'b1',
      billed_on: '2026-05-05',
      period_start: '2026-05-01',
      amount: 2000,
      amount_paid: 2000,
      status: 'paid',
    },
    {
      id: 'b2',
      billed_on: '2026-06-05',
      period_start: '2026-06-01',
      amount: 2000,
      amount_paid: 2000,
      status: 'paid',
    },
    {
      id: 'b3',
      billed_on: '2026-07-05',
      period_start: '2026-07-01',
      amount: 0,
      amount_paid: 0,
      status: 'paid',
      is_extension: true,
    },
    {
      id: 'b4',
      billed_on: '2026-08-05',
      period_start: '2026-08-01',
      amount: 2000,
      amount_paid: 2000,
      status: 'paid',
    },
  ];

  it('derives colors and streak from ledger (extension breaks then restarts)', () => {
    const tl = buildClientStreakTimeline({
      client: { lifecycle_status: 'active' },
      billings,
      from: '2026-05',
      to: '2026-08',
      today,
    });
    const byYm = Object.fromEntries(tl.months.map((m) => [m.year_month, m.disposition]));
    assert.equal(byYm['2026-05'], 'paid');
    assert.equal(byYm['2026-06'], 'paid');
    assert.equal(byYm['2026-07'], 'extension');
    assert.equal(byYm['2026-08'], 'paid');
    assert.equal(tl.summary.current_streak, 1);
    assert.equal(tl.summary.total_extensions, 1);
    assert.equal(tl.summary.total_paid, 3);
  });

  it('applies override over extension and restores full-freight paid', () => {
    const tl = buildClientStreakTimeline({
      client: { lifecycle_status: 'active' },
      billings,
      overrides: [
        {
          year_month: '2026-07',
          disposition: 'paid',
          note: 'founder retention exception',
        },
      ],
      from: '2026-05',
      to: '2026-08',
      today,
    });
    const jul = tl.months.find((m) => m.year_month === '2026-07');
    assert.equal(jul?.disposition, 'paid');
    assert.equal(jul?.ledger_disposition, 'extension');
    assert.equal(jul?.source, 'override');
    assert.equal(tl.summary.current_streak, 4);
    assert.equal(tl.summary.milestone_m3, true);
  });

  it('paints paused months gray when billing_paused and no ledger', () => {
    const tl = buildClientStreakTimeline({
      client: {
        lifecycle_status: 'active',
        billing_paused: true,
        billing_paused_at: '2026-07-01T00:00:00.000Z',
      },
      billings: [
        {
          id: 'p1',
          billed_on: '2026-06-01',
          amount: 1000,
          amount_paid: 1000,
          status: 'paid',
        },
      ],
      from: '2026-06',
      to: '2026-08',
      today,
    });
    assert.equal(tl.months.find((m) => m.year_month === '2026-07')?.disposition, 'paused');
    assert.equal(tl.months.find((m) => m.year_month === '2026-08')?.disposition, 'paused');
    assert.equal(tl.summary.total_paused, 2);
  });

  it('merges multi-row months preferring paid over unpaid', () => {
    const tl = buildClientStreakTimeline({
      client: { lifecycle_status: 'active' },
      billings: [
        {
          id: 'u1',
          billed_on: '2026-07-01',
          amount: 2000,
          amount_paid: 0,
          status: 'pending',
          due_date: '2026-07-02',
        },
        {
          id: 'p1',
          billed_on: '2026-07-15',
          amount: 2000,
          amount_paid: 2000,
          status: 'paid',
        },
      ],
      from: '2026-07',
      to: '2026-07',
      today,
    });
    assert.equal(tl.months[0]?.disposition, 'paid');
  });
});

describe('summarizeStreak', () => {
  it('sets milestone badges from current streak', () => {
    const s = summarizeStreak(
      cells([
        ['2026-01', 'paid'],
        ['2026-02', 'paid'],
        ['2026-03', 'paid'],
        ['2026-04', 'paid'],
        ['2026-05', 'paid'],
        ['2026-06', 'paid'],
      ]),
    );
    assert.equal(s.current_streak, 6);
    assert.equal(s.milestone_m3, true);
    assert.equal(s.milestone_m6, true);
  });
});
