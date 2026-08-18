import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  barsForChart,
  compareRowFromMetrics,
  costMapPoints,
  isDefaultRosterClient,
  mapMedians,
  medianOf,
  rangeForComparePreset,
  rateMapPoints,
  rosterIdsForOffer,
  showPendingCaveat,
  visibleChartKeys,
  type ClientCompareRow,
} from './client-compare';
import { calculateMetrics, type EventRow, type SpendRow } from './metrics';
import type { ReportingType } from './kpi-layouts';

function lead(id: string, qualified = true): EventRow {
  return {
    client_id: 'c1',
    event_type: 'lead',
    ghl_contact_id: id,
    occurred_at: '2026-07-01T12:00:00.000Z',
    is_qualified: qualified,
    is_pickup: null,
    is_conversation: null,
    speed_to_lead_seconds: null,
  };
}

function evt(type: string, id: string): EventRow {
  return {
    client_id: 'c1',
    event_type: type,
    ghl_contact_id: id,
    occurred_at: '2026-07-02T12:00:00.000Z',
    is_pickup: null,
    is_conversation: null,
    speed_to_lead_seconds: null,
  };
}

function row(
  reporting_type: ReportingType,
  events: EventRow[],
  spend: SpendRow[],
  extras: Partial<{ id: string; name: string; lifecycle_status: string | null; billing_paused: boolean }> = {},
): ClientCompareRow {
  return compareRowFromMetrics({
    id: extras.id ?? 'c1',
    name: extras.name ?? 'Acme',
    reporting_type,
    lifecycle_status: extras.lifecycle_status,
    billing_paused: extras.billing_paused,
    metrics: calculateMetrics(events, spend),
  });
}

const fiveLeads = ['a', 'b', 'c', 'd', 'e'].map(id => lead(id));

describe('client-compare roster', () => {
  it('excludes churned and billing-paused from the default roster', () => {
    assert.equal(isDefaultRosterClient({ lifecycle_status: 'active' }), true);
    assert.equal(isDefaultRosterClient({ lifecycle_status: 'onboarding' }), true);
    assert.equal(isDefaultRosterClient({ lifecycle_status: 'churned' }), false);
    assert.equal(isDefaultRosterClient({ lifecycle_status: 'active', billing_paused: true }), false);
  });

  it('offer reset lists default-roster ids for that product', () => {
    const rm = row('RM', fiveLeads, [{ amount: 100 }], { id: 'rm1', name: 'RM One' });
    const dscr = row('DSCR', fiveLeads, [{ amount: 100 }], { id: 'd1', name: 'DSCR One' });
    const churned = compareRowFromMetrics({
      id: 'old',
      name: 'Gone',
      reporting_type: 'RM',
      lifecycle_status: 'churned',
      metrics: calculateMetrics(fiveLeads, [{ amount: 50 }]),
    });
    assert.deepEqual(rosterIdsForOffer([rm, dscr, churned], 'RM'), ['rm1']);
    assert.deepEqual(rosterIdsForOffer([rm, dscr, churned], 'all').sort(), ['d1', 'rm1']);
  });
});

describe('client-compare null vs zero', () => {
  it('turns empty-denominator costs into null, not $0', () => {
    const paid = row('RM', [], []);
    assert.equal(paid.cpl, null);
    assert.equal(paid.cpql, null);
    assert.equal(paid.cpconv, null);
    assert.equal(paid.hand_raise, null);
    assert.equal(paid.show_rate, null);
    assert.equal(paid.spend, 0);
  });

  it('plots $0 spend with leads as a real number', () => {
    const paid = row('RM', fiveLeads, []);
    assert.equal(paid.spend, 0);
    assert.equal(paid.cpl, 0);
    assert.equal(paid.leads, 5);
  });

  it('omits null spend from cost charts but keeps $0 spend', () => {
    const zeroSpend = row('RM', fiveLeads, [], { id: 'z', name: 'Zero' });
    const cc = row('CALL_CENTER', fiveLeads, [], { id: 'cc', name: 'CC' });
    const spendBars = barsForChart([zeroSpend, cc], 'spend');
    assert.equal(spendBars.length, 1);
    assert.equal(spendBars[0].id, 'z');
    assert.equal(spendBars[0].value, 0);
  });
});

describe('client-compare Call Center', () => {
  it('never receives spend / CPL / CPQL / CPConv', () => {
    const cc = row('CALL_CENTER', [...fiveLeads, evt('appointment_booked', 'a'), evt('show', 'a')], [
      { amount: 999 },
    ]);
    assert.equal(cc.is_call_center, true);
    assert.equal(cc.spend, null);
    assert.equal(cc.cpl, null);
    assert.equal(cc.cpql, null);
    assert.equal(cc.cpconv, null);
    assert.ok(cc.hand_raise != null);
  });

  it('hides cost charts when the set is Call Center only', () => {
    const cc = row('CALL_CENTER', fiveLeads, [], { id: 'cc' });
    const keys = visibleChartKeys([cc]);
    assert.equal(keys.includes('cpl'), false);
    assert.equal(keys.includes('booked'), true);
  });

  it('excludes Call Center from mixed-set cost charts', () => {
    const rm = row('RM', fiveLeads, [{ amount: 200 }], { id: 'rm' });
    const cc = row('CALL_CENTER', fiveLeads, [], { id: 'cc' });
    const keys = visibleChartKeys([rm, cc]);
    assert.equal(keys.includes('cpl'), true);
    assert.equal(keys.includes('booked'), false);
    assert.deepEqual(
      barsForChart([rm, cc], 'cpl').map(b => b.id),
      ['rm'],
    );
  });
});

describe('client-compare maps', () => {
  it('cost map only includes numeric CPConv and hand-raise', () => {
    const events = [
      ...fiveLeads,
      evt('appointment_booked', 'a'),
      evt('show', 'a'),
      evt('appointment_booked', 'b'),
      evt('show', 'b'),
      evt('appointment_booked', 'c'),
      evt('claimed', 'c'),
    ];
    const paid = row('RM', events, [{ amount: 300 }], { id: 'rm' });
    const noConv = row('RM', fiveLeads, [{ amount: 300 }], { id: 'empty' });
    const cc = row('CALL_CENTER', events, [], { id: 'cc' });
    const points = costMapPoints([paid, noConv, cc]);
    assert.deepEqual(points.map(p => p.id), ['rm']);
    assert.equal(points[0].x, paid.cpconv);
    assert.equal(points[0].y, paid.hand_raise);
  });

  it('rate map requires both numeric hand-raise and Show Rate', () => {
    const noBook = row('RM', fiveLeads, [{ amount: 10 }], { id: 'nb' });
    const booked = row(
      'RM',
      [...fiveLeads, evt('appointment_booked', 'a'), evt('show', 'a')],
      [{ amount: 10 }],
      { id: 'bk' },
    );
    const points = rateMapPoints([noBook, booked]);
    assert.deepEqual(points.map(p => p.id), ['bk']);
  });

  it('median ignores hollow / low-volume points', () => {
    const loud = row(
      'RM',
      [
        ...fiveLeads,
        ...['a', 'b', 'c', 'd', 'e'].flatMap(id => [evt('appointment_booked', id), evt('show', id)]),
      ],
      [{ amount: 500 }],
      { id: 'loud' },
    );
    const quiet = row('RM', [lead('x'), evt('appointment_booked', 'x'), evt('show', 'x')], [{ amount: 10 }], {
      id: 'quiet',
    });
    const points = costMapPoints([loud, quiet]);
    assert.equal(points.length, 2);
    const quietPt = points.find(p => p.id === 'quiet');
    assert.equal(quietPt?.hollow, true);
    const med = mapMedians(points);
    assert.equal(med.x, loud.cpconv);
    assert.equal(med.y, loud.hand_raise);
  });
});

describe('client-compare grades', () => {
  it('grades CPConv against global bands, not a second table', () => {
    const events = [
      ...fiveLeads,
      ...['a', 'b', 'c', 'd', 'e'].map(id => evt('show', id)),
    ];
    const expensive = row('RM', events, [{ amount: 2000 }]);
    assert.equal(expensive.cpconv, 400);
    assert.equal(expensive.grades.cpconv, 'critical');
    assert.equal(expensive.north_star_grade, 'critical');
  });
});

describe('client-compare median and dates', () => {
  it('medianOf uses the midpoint of the sorted visible values', () => {
    assert.equal(medianOf([3, 1, 2]), 2);
    assert.equal(medianOf([1, 2, 3, 4]), 2.5);
    assert.equal(medianOf([]), null);
  });

  it('shows the pending-appointment caveat on windows of 14 days or less', () => {
    assert.equal(showPendingCaveat('2026-08-01', '2026-08-14'), true);
    assert.equal(showPendingCaveat('2026-08-01', '2026-08-15'), false);
  });

  it('last_30 range ends on today and starts 30 days earlier', () => {
    const r = rangeForComparePreset('last_30', '2026-08-18');
    assert.equal(r.end, '2026-08-18');
    assert.equal(r.start, '2026-07-19');
  });
});
