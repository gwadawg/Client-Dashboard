import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEAM_MEETING_SEED,
  plannedSlotsForRange,
  todayYmdInCallCenterTz,
  validateCompletePayload,
  weekdaysForTemplate,
} from './team-meetings';

describe('team-meetings', () => {
  it('seeds five active series', () => {
    assert.equal(TEAM_MEETING_SEED.length, 5);
  });

  it('daily training expands to Mon–Fri', () => {
    assert.deepEqual(weekdaysForTemplate({ weekdays: [] }), [1, 2, 3, 4, 5]);
  });

  it('schedules mon KPI only on Mondays in Sao Paulo', () => {
    const seed = TEAM_MEETING_SEED.find(t => t.slug === 'mon-kpi-week-plan');
    assert.ok(seed);
    const slots = plannedSlotsForRange(seed, '2026-07-20', '2026-07-26', 'America/Sao_Paulo');
    assert.equal(slots.length, 1);
    // 10:00 BRT (UTC-3 in July) → 13:00 UTC
    assert.equal(slots[0].toISOString(), '2026-07-20T13:00:00.000Z');
  });

  it('schedules fri exec qa at 16:00 Sao Paulo', () => {
    const seed = TEAM_MEETING_SEED.find(t => t.slug === 'fri-exec-qa');
    assert.ok(seed);
    const slots = plannedSlotsForRange(seed, '2026-07-24', '2026-07-24', 'America/Sao_Paulo');
    assert.equal(slots.length, 1);
    assert.equal(slots[0].toISOString(), '2026-07-24T19:00:00.000Z');
  });

  it('rejects complete without recording unless skipped', () => {
    const r = validateCompletePayload({
      status: 'completed',
      checklist: [{ key: 'a', label: 'A', required: true }],
      checklist_state: { a: true },
      responses: { summary: 'ok', participants_present: 'team' },
      recording_url: '',
    });
    assert.equal(r.ok, false);
  });

  it('accepts skip with reason and no recording', () => {
    const r = validateCompletePayload({
      status: 'skipped',
      checklist: [{ key: 'a', label: 'A', required: true }],
      checklist_state: {},
      responses: { skipped_reason: 'Host out sick' },
      recording_url: '',
    });
    assert.equal(r.ok, true);
  });

  it('formats today in Sao Paulo as Y-M-D', () => {
    // Fixed UTC instant: 2026-07-21T02:00Z = still Jul 20 evening in SP (UTC-3)
    const ymd = todayYmdInCallCenterTz(new Date('2026-07-21T02:00:00.000Z'), 'America/Sao_Paulo');
    assert.equal(ymd, '2026-07-20');
  });
});
