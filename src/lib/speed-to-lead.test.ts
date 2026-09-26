import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeSpeedToLead,
  type AvailabilityWindow,
  type SpeedToLeadEventRow,
} from '@/lib/speed-to-lead';
import {
  parseSqlSpeedToLeadSummary,
  speedResultFromSqlSummary,
} from '@/lib/metrics-from-sql';

const TZ = 'America/Sao_Paulo';

/** Monday 2026-03-16 — Sao Paulo is UTC-3. */
const MON_LEAD = '2026-03-16T14:00:00.000Z'; // 11:00 SP
const MON_DIAL = '2026-03-16T14:05:00.000Z'; // 11:05 SP → 300s
const MON_DIAL_SLOW = '2026-03-16T14:20:00.000Z'; // 20 min

const liveMon: AvailabilityWindow[] = [
  { weekday: 'Monday', time_start: '09:00', time_end: '17:00', is_live: true },
];

function lead(
  overrides: Partial<SpeedToLeadEventRow> & { client_id: string; ghl_contact_id?: string },
): SpeedToLeadEventRow {
  return {
    event_type: 'lead',
    lead_phone: null,
    occurred_at: MON_LEAD,
    occurred_at_has_time: true,
    ghl_contact_id: overrides.ghl_contact_id ?? null,
    ...overrides,
  };
}

function dial(
  overrides: Partial<SpeedToLeadEventRow> & { client_id: string; ghl_contact_id?: string },
): SpeedToLeadEventRow {
  return {
    event_type: 'dial',
    lead_phone: null,
    occurred_at: MON_DIAL,
    occurred_at_has_time: true,
    ghl_contact_id: overrides.ghl_contact_id ?? null,
    ...overrides,
  };
}

describe('computeSpeedToLead (golden for SQL RPC parity)', () => {
  it('median of odd sample, in-window only', () => {
    const events: SpeedToLeadEventRow[] = [
      lead({ client_id: 'c1', ghl_contact_id: 'a' }),
      dial({ client_id: 'c1', ghl_contact_id: 'a', occurred_at: MON_DIAL }), // 5 min
      lead({ client_id: 'c1', ghl_contact_id: 'b' }),
      dial({ client_id: 'c1', ghl_contact_id: 'b', occurred_at: MON_DIAL_SLOW }), // 20 min
      lead({ client_id: 'c1', ghl_contact_id: 'c' }),
      dial({
        client_id: 'c1',
        ghl_contact_id: 'c',
        occurred_at: '2026-03-16T14:10:00.000Z',
      }), // 10 min
    ];
    const r = computeSpeedToLead(events, liveMon, TZ);
    assert.equal(r.sample_size, 3);
    assert.equal(r.median_min, 10);
    assert.equal(r.excluded_out_of_window, 0);
    assert.equal(r.excluded_no_time, 0);
  });

  it('excludes off-hours leads when live windows exist', () => {
    // 03:00 SP = 06:00 UTC
    const nightLead = '2026-03-16T06:00:00.000Z';
    const nightDial = '2026-03-16T06:02:00.000Z';
    const events: SpeedToLeadEventRow[] = [
      lead({ client_id: 'c1', ghl_contact_id: 'night', occurred_at: nightLead }),
      dial({ client_id: 'c1', ghl_contact_id: 'night', occurred_at: nightDial }),
      lead({ client_id: 'c1', ghl_contact_id: 'day' }),
      dial({ client_id: 'c1', ghl_contact_id: 'day' }),
    ];
    const r = computeSpeedToLead(events, liveMon, TZ);
    assert.equal(r.sample_size, 1);
    assert.equal(r.median_min, 5);
    assert.equal(r.excluded_out_of_window, 1);
  });

  it('excludes date-only timestamps (occurred_at_has_time = false)', () => {
    const events: SpeedToLeadEventRow[] = [
      lead({
        client_id: 'c1',
        ghl_contact_id: 'd',
        occurred_at_has_time: false,
      }),
      dial({ client_id: 'c1', ghl_contact_id: 'd' }),
    ];
    const r = computeSpeedToLead(events, liveMon, TZ);
    assert.equal(r.sample_size, 0);
    assert.equal(r.excluded_no_time, 1);
    assert.equal(r.median_min, null);
  });

  it('prefers dial.lead_created_at over lead event', () => {
    const events: SpeedToLeadEventRow[] = [
      dial({
        client_id: 'c1',
        ghl_contact_id: 'hp',
        lead_created_at: MON_LEAD,
        occurred_at: MON_DIAL,
      }),
    ];
    const r = computeSpeedToLead(events, liveMon, TZ);
    assert.equal(r.sample_size, 1);
    assert.equal(r.median_min, 5);
  });

  it('even sample median averages the two middle values', () => {
    const events: SpeedToLeadEventRow[] = [
      lead({ client_id: 'c1', ghl_contact_id: 'a' }),
      dial({ client_id: 'c1', ghl_contact_id: 'a', occurred_at: MON_DIAL }), // 5
      lead({ client_id: 'c1', ghl_contact_id: 'b' }),
      dial({
        client_id: 'c1',
        ghl_contact_id: 'b',
        occurred_at: '2026-03-16T14:15:00.000Z',
      }), // 15
    ];
    const r = computeSpeedToLead(events, liveMon, TZ);
    assert.equal(r.sample_size, 2);
    // (5+15)/2 = 10
    assert.equal(r.median_min, 10);
  });
});

describe('parseSqlSpeedToLeadSummary', () => {
  it('maps RPC jsonb into summary fields', () => {
    const parsed = parseSqlSpeedToLeadSummary({
      median_min: 12.5,
      sample_size: 40,
      excluded_out_of_window: 3,
      excluded_no_time: 1,
      excluded_before_cutoff: 0,
      excluded_after_cutoff: 2,
      time_zone: TZ,
      live_window_count: 5,
    });
    assert.ok(parsed);
    assert.equal(parsed!.median_min, 12.5);
    assert.equal(parsed!.sample_size, 40);
    const full = speedResultFromSqlSummary(parsed!);
    assert.equal(full.readings.length, 0);
    assert.equal(full.median_min, 12.5);
  });

  it('treats null median as null when sample_size is 0', () => {
    const parsed = parseSqlSpeedToLeadSummary({
      median_min: null,
      sample_size: 0,
      excluded_out_of_window: 0,
      excluded_no_time: 0,
      excluded_before_cutoff: 0,
      excluded_after_cutoff: 0,
      time_zone: TZ,
      live_window_count: 0,
    });
    assert.equal(parsed!.median_min, null);
  });
});
