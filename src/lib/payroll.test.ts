import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCommissionReport } from './agent-commissions';
import { buildB2BSetterCommissionReport } from './b2b-setter-commissions';
import { buildSalariedCommissionReport } from './salaried-commissions';
import { computeFixedPay } from './payroll-common';
import { bucketCallRepPendingDisposition } from './payroll-pending-disposition';

describe('computeFixedPay', () => {
  it('returns full base and bonus when no prorate', () => {
    const result = computeFixedPay(2000, 200, null, '2026-05-01');
    assert.equal(result.base, 2000);
    assert.equal(result.bonus, 200);
  });

  it('prorates base and bonus by days', () => {
    const result = computeFixedPay(3100, 310, 15, '2026-05-01');
    assert.equal(result.base, 1500);
    assert.equal(result.bonus, 150);
  });
});

describe('buildCommissionReport', () => {
  const roster = [
    {
      id: 'a1',
      name: 'Luka',
      phone: '1',
      base_salary: 1000,
      monthly_bonus: 100,
      pay_per_booking: 10,
      pay_per_show: 20,
      pay_per_live_transfer: 5,
    },
  ];

  it('includes monthly bonus in total', () => {
    const report = buildCommissionReport(
      roster,
      [{ id: 'c1', name: 'Client A' }],
      [
        {
          id: 'e1',
          client_id: 'c1',
          event_type: 'appointment_booked',
          agent_name: 'Luka',
          occurred_at: '2026-05-10T12:00:00Z',
          scheduled_at: null,
          lead_name: 'Lead',
          lead_phone: '555',
          raw: null,
        },
      ],
      [],
      '2026-05-01',
      '2026-05-31',
    );
    assert.equal(report.agents.length, 1);
    assert.equal(report.agents[0].amounts.bonus, 100);
    assert.equal(report.agents[0].amounts.bookings, 10);
    assert.equal(report.agents[0].amounts.total, 1110);
  });
});

describe('buildB2BSetterCommissionReport', () => {
  const roster = [
    {
      id: 'b1',
      name: 'Setter',
      phone: 'b2b-1',
      base_salary: 500,
      monthly_bonus: 50,
      pay_per_qualified_demo: 25,
      pay_per_close: 100,
    },
  ];

  it('counts qualified demos and closes', () => {
    const report = buildB2BSetterCommissionReport(
      roster,
      [
        {
          id: 'd1',
          lead_name: 'Demo Lead',
          phone: '555',
          scheduled_at: '2026-05-15T10:00:00Z',
          status: 'showed',
          qualified: true,
          setter_name: 'Setter',
        },
      ],
      [
        {
          id: 'cl1',
          lead_id: 'l1',
          closed_at: '2026-05-20T10:00:00Z',
          setter_name: 'Setter',
        },
      ],
      new Map([['l1', 'Closed Lead']]),
      '2026-05-01',
      '2026-05-31',
    );
    assert.equal(report.agents.length, 1);
    assert.equal(report.agents[0].counts.qualified_demos, 1);
    assert.equal(report.agents[0].counts.closes, 1);
    assert.equal(report.agents[0].amounts.total, 675);
  });
});

describe('buildSalariedCommissionReport', () => {
  it('includes salaried employees with base or bonus only', () => {
    const report = buildSalariedCommissionReport(
      [
        { id: 'e1', name: 'Alex', phone: 'alex', pay_type: 'admin', base_salary: 4000, monthly_bonus: 500 },
        { id: 'e2', name: 'Sam', phone: 'sam', pay_type: 'media_buyer', base_salary: 0, monthly_bonus: 0 },
      ],
      '2026-05-01',
      '2026-05-31',
    );
    assert.equal(report.agents.length, 1);
    assert.equal(report.agents[0].agent_name, 'Alex');
    assert.equal(report.agents[0].amounts.total, 4500);
  });
});

describe('bucketCallRepPendingDisposition', () => {
  it('buckets inferred uncredited events by roster employee', () => {
    const roster = [{ id: 'a1', name: 'Luka', phone: 'luka' }];
    const buckets = bucketCallRepPendingDisposition(
      roster,
      [
        {
          id: 'e1',
          event_type: 'live_transfer',
          occurred_at: '2026-05-10T12:00:00Z',
          scheduled_at: null,
          calendar_name: null,
          lead_name: 'Lead',
          agent_name: null,
        },
      ],
      '2026-05-01',
      '2026-05-31',
    );
    assert.equal(buckets.get('a1')!.length, 0);
  });
});
