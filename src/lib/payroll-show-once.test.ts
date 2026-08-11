import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractPaidShowLeadKeysFromEmployee,
  filterShowsOncePerLead,
  mergePaidShowLeadKeys,
  autoExcludeBannedShowPays,
  SHOW_ALREADY_PAID_REASON,
  SHOW_DUPLICATE_PERIOD_REASON,
  showLeadMatchKey,
} from './payroll-show-once';

describe('showLeadMatchKey', () => {
  it('keys by normalized phone', () => {
    assert.equal(showLeadMatchKey({ lead_phone: '+1 (555) 123-4567', lead_name: 'A' }), 'phone:5551234567');
  });
});

describe('extractPaidShowLeadKeysFromEmployee', () => {
  it('collects non-excluded show leads and ignores other types', () => {
    const keys = extractPaidShowLeadKeysFromEmployee({
      section: 'call_rep',
      line_items: [
        { type: 'show', event_id: 's1', lead_phone: '5551112222', lead_name: 'Alice' },
        { type: 'booking', event_id: 'b1', lead_phone: '5551112222', lead_name: 'Alice' },
        { type: 'show', event_id: 's2', lead_phone: '5559998888', lead_name: 'Bob' },
        { type: 'show', event_id: 's3', lead_phone: '5557776666', lead_name: 'C' },
      ],
      line_item_exclusions: [{ event_id: 's3', reason: 'dup' }],
    });
    assert.deepEqual(new Set(keys), new Set(['phone:5551112222', 'phone:5559998888']));
  });

  it('skips non call_rep sections', () => {
    const keys = extractPaidShowLeadKeysFromEmployee({
      section: 'b2b_setter',
      line_items: [{ type: 'show', event_id: 's1', lead_phone: '5551112222' }],
    });
    assert.equal(keys.length, 0);
  });
});

describe('filterShowsOncePerLead', () => {
  const resolve = (name: string | null | undefined) => {
    if (!name) return null;
    if (name === 'Bernardo Fabris' || name === 'Luka Faccini') return name;
    return null;
  };

  const base = {
    resolveAgent: resolve,
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  };

  it('bans leads already paid in prior payroll', () => {
    const paid = new Set(['phone:5551112222']);
    const { allowed, suppressed } = filterShowsOncePerLead(
      [
        {
          id: 'e1',
          event_type: 'show',
          agent_name: 'Bernardo Fabris',
          lead_phone: '+15551112222',
          lead_name: 'Alice',
          scheduled_at: '2026-07-10T12:00:00.000Z',
          occurred_at: '2026-07-10T12:00:00.000Z',
        },
      ],
      { ...base, paidLeadKeys: paid },
    );
    assert.equal(allowed.filter(a => a.id === 'e1').length, 0);
    assert.equal(suppressed.length, 1);
    assert.equal(suppressed[0].reason, SHOW_ALREADY_PAID_REASON);
  });

  it('keeps only the earliest show per lead within the period across agents', () => {
    const { allowed, suppressed } = filterShowsOncePerLead(
      [
        {
          id: 'late',
          event_type: 'show',
          agent_name: 'Luka Faccini',
          lead_phone: '5553334444',
          lead_name: 'Dup',
          scheduled_at: '2026-07-20T12:00:00.000Z',
          occurred_at: '2026-07-20T12:00:00.000Z',
        },
        {
          id: 'early',
          event_type: 'show',
          agent_name: 'Bernardo Fabris',
          lead_phone: '5553334444',
          lead_name: 'Dup',
          scheduled_at: '2026-07-05T12:00:00.000Z',
          occurred_at: '2026-07-05T12:00:00.000Z',
        },
        {
          id: 'other',
          event_type: 'show',
          agent_name: 'Luka Faccini',
          lead_phone: '5550001111',
          lead_name: 'Other',
          scheduled_at: '2026-07-08T12:00:00.000Z',
          occurred_at: '2026-07-08T12:00:00.000Z',
        },
      ],
      { ...base, paidLeadKeys: new Set() },
    );
    const ids = new Set(allowed.map(a => a.id));
    assert.ok(ids.has('early'));
    assert.ok(ids.has('other'));
    assert.ok(!ids.has('late'));
    assert.equal(suppressed.length, 1);
    assert.equal(suppressed[0].event_id, 'late');
    assert.equal(suppressed[0].reason, SHOW_DUPLICATE_PERIOD_REASON);
  });

  it('does not pay the same lead twice to the same agent in one period', () => {
    const { allowed, suppressed } = filterShowsOncePerLead(
      [
        {
          id: 's1',
          event_type: 'show',
          agent_name: 'Bernardo Fabris',
          lead_phone: '5554445555',
          scheduled_at: '2026-07-01T12:00:00.000Z',
          occurred_at: '2026-07-01T12:00:00.000Z',
        },
        {
          id: 's2',
          event_type: 'show',
          agent_name: 'Bernardo Fabris',
          lead_phone: '5554445555',
          scheduled_at: '2026-07-15T12:00:00.000Z',
          occurred_at: '2026-07-15T12:00:00.000Z',
        },
      ],
      { ...base, paidLeadKeys: new Set() },
    );
    assert.equal(allowed.filter(a => a.agent_name === 'Bernardo Fabris').length, 1);
    assert.equal(allowed[0].id, 's1');
    assert.equal(suppressed.length, 1);
  });

  it('leaves unassigned shows alone (they are not paid)', () => {
    const { allowed, suppressed } = filterShowsOncePerLead(
      [
        {
          id: 'blank',
          event_type: 'show',
          agent_name: null,
          lead_phone: '5556667777',
          scheduled_at: '2026-07-10T12:00:00.000Z',
          occurred_at: '2026-07-10T12:00:00.000Z',
        },
      ],
      { ...base, paidLeadKeys: new Set(['phone:5556667777']) },
    );
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0].id, 'blank');
    assert.equal(suppressed.length, 0);
  });

  it('autoExcludeBannedShowPays excludes prior-paid and in-row duplicates', () => {
    const items = [
      { type: 'show', event_id: 's1', lead_phone: '5551110000', lead_name: 'A' },
      { type: 'show', event_id: 's2', lead_phone: '5551110000', lead_name: 'A' },
      { type: 'show', event_id: 's3', lead_phone: '5559990000', lead_name: 'B' },
    ];
    const excl = autoExcludeBannedShowPays(items, [], new Set(['phone:5559990000']));
    assert.equal(excl.some(e => e.event_id === 's2' && e.reason === SHOW_DUPLICATE_PERIOD_REASON), true);
    assert.equal(excl.some(e => e.event_id === 's3' && e.reason === SHOW_ALREADY_PAID_REASON), true);
    assert.equal(excl.some(e => e.event_id === 's1'), false);
  });
});
