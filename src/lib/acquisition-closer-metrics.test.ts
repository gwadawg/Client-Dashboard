import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateCloserMetrics } from '@/lib/acquisition-closer-metrics';

describe('calculateCloserMetrics reinstate credit', () => {
  it('credits closes from raw.closer_name when no demo/offer link exists', () => {
    const rows = calculateCloserMetrics({
      calls: [],
      offers: [],
      closes: [
        {
          id: 'c1',
          lead_id: null,
          closed_at: '2026-09-17T12:00:00.000Z',
          offer_type: 'core_offer',
          cash_collected: 5000,
          close_kind: 'reinstate',
          raw: { closer_name: 'Alex Closer', close_kind: 'reinstate' },
        },
      ],
      from: '2026-09-01',
      to: '2026-09-30',
      offerScope: 'core',
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].closer, 'Alex Closer');
    assert.equal(rows[0].closes, 1);
    assert.equal(rows[0].cash_collected, 5000);
    assert.equal(rows[0].demos_ran, 0);
  });

  it('prefers appointment-linked closer over raw.closer_name when both exist', () => {
    const rows = calculateCloserMetrics({
      calls: [
        {
          id: 'call1',
          call_type: 'demo',
          called_at: '2026-09-10T12:00:00.000Z',
          status: 'showed',
          handled_by: 'Demo Closer',
          appointment_id: 'appt1',
        },
      ],
      offers: [
        {
          id: 'o1',
          lead_id: 'lead1',
          appointment_id: 'appt1',
          offered_at: '2026-09-10T13:00:00.000Z',
          offer_type: 'core_offer',
          is_closed: true,
          cash_collected: 1000,
          setter_name: null,
        },
      ],
      closes: [
        {
          id: 'c1',
          lead_id: 'lead1',
          closed_at: '2026-09-11T12:00:00.000Z',
          offer_type: 'core_offer',
          cash_collected: 1000,
          close_kind: 'standard',
          raw: { closer_name: 'Should Not Win' },
        },
      ],
      from: '2026-09-01',
      to: '2026-09-30',
    });

    const demo = rows.find((r) => r.closer === 'Demo Closer');
    assert.ok(demo);
    assert.equal(demo!.closes, 1);
    assert.equal(
      rows.find((r) => r.closer === 'Should Not Win'),
      undefined,
    );
  });
});
