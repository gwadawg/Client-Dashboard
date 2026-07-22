import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEAM_MEETING_SEED,
  librarySlugsForTemplate,
  plannedSlotsForRange,
  todayYmdInCallCenterTz,
  validateCompletePayload,
  weekdaysForTemplate,
} from './team-meetings';

describe('team-meetings', () => {
  it('seeds six series including Mon weekly review', () => {
    assert.equal(TEAM_MEETING_SEED.length, 6);
    assert.ok(TEAM_MEETING_SEED.some(t => t.slug === 'mon-setter-weekly-review'));
  });

  it('daily training is Tue–Fri only', () => {
    const seed = TEAM_MEETING_SEED.find(t => t.slug === 'daily-setter-training');
    assert.ok(seed);
    assert.deepEqual(weekdaysForTemplate(seed), [2, 3, 4, 5]);
  });

  it('schedules Mon weekly review only on Mondays', () => {
    const seed = TEAM_MEETING_SEED.find(t => t.slug === 'mon-setter-weekly-review');
    assert.ok(seed);
    const slots = plannedSlotsForRange(seed, '2026-07-20', '2026-07-26', 'America/Sao_Paulo');
    assert.equal(slots.length, 1);
    assert.equal(slots[0].toISOString(), '2026-07-20T12:00:00.000Z'); // 09:00 BRT
  });

  it('daily training expands empty weekdays to Mon–Fri helper still works', () => {
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

  it('fills Mon/Thu KPI agendas and Ops Needs Founder; attaches library SOP slugs', () => {
    const mon = TEAM_MEETING_SEED.find(t => t.slug === 'mon-kpi-week-plan');
    const thu = TEAM_MEETING_SEED.find(t => t.slug === 'thu-kpi-commitment-check');
    const ops = TEAM_MEETING_SEED.find(t => t.slug === 'mon-ops-planning');
    assert.ok(mon && thu && ops);
    assert.equal(mon.agenda_md.includes('PLACEHOLDER'), false);
    assert.equal(thu.agenda_md.includes('PLACEHOLDER'), false);
    assert.equal(ops.agenda_md.includes('PLACEHOLDER'), false);
    assert.ok(ops.agenda_md.includes('Needs Founder'));
    assert.ok(mon.agenda_md.includes('Commitments panel'));
    assert.deepEqual(librarySlugsForTemplate('mon-kpi-week-plan'), [
      'kpi-review-meeting-sop',
      'under-kpi-diagnosis-ladder',
    ]);
    assert.deepEqual(librarySlugsForTemplate('thu-kpi-commitment-check'), [
      'kpi-review-meeting-sop',
      'under-kpi-diagnosis-ladder',
    ]);
    assert.deepEqual(
      mon.checklist.map(c => c.key),
      ['ryg_scan_done', 'reds_have_owners', 'commitments_named', 'ob_glance'],
    );
    assert.deepEqual(
      thu.checklist.map(c => c.key),
      ['commitments_checked', 'still_red_recommitted', 'fri_qa_reminded'],
    );
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
