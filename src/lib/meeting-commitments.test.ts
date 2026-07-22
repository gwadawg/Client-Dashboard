import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  commitmentModeForTemplateSlug,
  filterNeedsFounder,
  filterOpenForWeek,
  softDuplicateWarn,
  type MeetingCommitmentStatus,
} from './meeting-commitments';

describe('meeting-commitments transitions', () => {
  it('allows seat-owned proposed → in_progress', () => {
    const r = canTransition('proposed', 'in_progress', { needsFounder: false });
    assert.equal(r.ok, true);
  });

  it('blocks needs_founder proposed → in_progress', () => {
    const r = canTransition('proposed', 'in_progress', { needsFounder: true });
    assert.equal(r.ok, false);
  });

  it('allows approve only when needs_founder', () => {
    assert.equal(canTransition('proposed', 'approved', { needsFounder: true }).ok, true);
    assert.equal(canTransition('proposed', 'approved', { needsFounder: false }).ok, false);
  });

  it('allows needs_founder approved → in_progress', () => {
    assert.equal(canTransition('approved', 'in_progress', { needsFounder: true }).ok, true);
  });

  it('rejects terminal transitions', () => {
    assert.equal(canTransition('landed', 'proposed', { needsFounder: false }).ok, false);
    assert.equal(canTransition('rejected', 'approved', { needsFounder: true }).ok, false);
  });

  it('allows thu dispositions from in_progress', () => {
    for (const to of ['landed', 'blocked', 'missed'] as MeetingCommitmentStatus[]) {
      assert.equal(canTransition('in_progress', to, { needsFounder: false }).ok, true);
    }
  });
});

describe('meeting-commitments filters', () => {
  const rows = [
    {
      id: '1',
      client_id: 'a',
      constraint_label: 'dial coverage',
      needs_founder: true,
      status: 'proposed' as const,
      due_date: '2026-07-23',
      created_at: '2026-07-20T12:00:00Z',
    },
    {
      id: '2',
      client_id: 'b',
      constraint_label: 'CPL',
      needs_founder: true,
      status: 'approved' as const,
      due_date: '2026-07-23',
      created_at: '2026-07-20T12:00:00Z',
    },
    {
      id: '3',
      client_id: 'c',
      constraint_label: 'show',
      needs_founder: false,
      status: 'in_progress' as const,
      due_date: '2026-07-23',
      created_at: '2026-07-20T12:00:00Z',
    },
    {
      id: '4',
      client_id: 'd',
      constraint_label: 'old',
      needs_founder: false,
      status: 'in_progress' as const,
      due_date: '2026-07-10',
      created_at: '2026-07-07T12:00:00Z',
    },
    {
      id: '5',
      client_id: 'a',
      constraint_label: 'dial coverage',
      needs_founder: false,
      status: 'landed' as const,
      due_date: '2026-07-23',
      created_at: '2026-07-20T12:00:00Z',
    },
  ];

  it('filterNeedsFounder keeps proposed/needs_clarification only', () => {
    const out = filterNeedsFounder(rows);
    assert.deepEqual(
      out.map(r => r.id),
      ['1'],
    );
  });

  it('filterOpenForWeek excludes terminal and out-of-week', () => {
    const out = filterOpenForWeek(rows, '2026-07-20', '2026-07-26');
    assert.deepEqual(
      out.map(r => r.id).sort(),
      ['1', '2', '3'],
    );
  });

  it('softDuplicateWarn detects open same client+label in week', () => {
    assert.equal(
      softDuplicateWarn(rows, 'a', 'Dial Coverage', {
        fromYmd: '2026-07-20',
        toYmd: '2026-07-26',
      }),
      true,
    );
    assert.equal(
      softDuplicateWarn(rows, 'a', 'other', {
        fromYmd: '2026-07-20',
        toYmd: '2026-07-26',
      }),
      false,
    );
  });

  it('maps template slugs to panel modes', () => {
    assert.equal(commitmentModeForTemplateSlug('mon-kpi-week-plan'), 'edit');
    assert.equal(commitmentModeForTemplateSlug('thu-kpi-commitment-check'), 'check');
    assert.equal(commitmentModeForTemplateSlug('mon-ops-planning'), 'approve');
    assert.equal(commitmentModeForTemplateSlug('fri-exec-qa'), null);
  });
});
