import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCpl,
  cplAlertDateWindow,
  formatCplThresholdSlackMessage,
  selectCplBreaches,
} from '@/lib/cpl-threshold-alert';

describe('cplAlertDateWindow', () => {
  it('returns an inclusive 4-day window ending today', () => {
    assert.deepEqual(cplAlertDateWindow('2026-08-21', 4), {
      start: '2026-08-18',
      end: '2026-08-21',
    });
  });

  it('treats windowDays=1 as today only', () => {
    assert.deepEqual(cplAlertDateWindow('2026-08-21', 1), {
      start: '2026-08-21',
      end: '2026-08-21',
    });
  });
});

describe('computeCpl / selectCplBreaches', () => {
  it('returns null CPL when there are no leads', () => {
    assert.equal(computeCpl(100, 0), null);
  });

  it('flags only clients over the threshold with leads', () => {
    const breaches = selectCplBreaches(
      [
        { client_id: 'a', client_name: 'Alpha', leads: 10, ad_spend: 400 }, // 40
        { client_id: 'b', client_name: 'Beta', leads: 10, ad_spend: 300 }, // 30
        { client_id: 'c', client_name: 'Gamma', leads: 0, ad_spend: 500 }, // skip
        { client_id: 'd', client_name: 'Delta', leads: 2, ad_spend: 80 }, // 40
      ],
      35,
    );
    assert.equal(breaches.length, 2);
    assert.equal(breaches[0].client_name, 'Alpha');
    assert.equal(breaches[0].cpl, 40);
    assert.equal(breaches[1].client_name, 'Delta');
  });
});

describe('formatCplThresholdSlackMessage', () => {
  it('lists breaches sorted already', () => {
    const text = formatCplThresholdSlackMessage({
      start: '2026-08-18',
      end: '2026-08-21',
      threshold: 35,
      breaches: [
        {
          client_id: 'a',
          client_name: 'Alpha Co',
          cpl: 42.5,
          leads: 4,
          ad_spend: 170,
        },
      ],
    });
    assert.match(text, /CPL over/);
    assert.match(text, /Alpha Co/);
    assert.match(text, /2026-08-18 → 2026-08-21/);
  });

  it('formats an all-clear message', () => {
    const text = formatCplThresholdSlackMessage({
      start: '2026-08-18',
      end: '2026-08-21',
      threshold: 35,
      breaches: [],
    });
    assert.match(text, /no active clients over/);
  });
});
