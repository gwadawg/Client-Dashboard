import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  callLogDraftToStored,
  defaultSectionsForCallType,
  emptyCallLogDraft,
  parseCallLogFormInput,
  storedToCallLogDraft,
} from './call-log-form';
import {
  callDraftToApiBody,
  defaultCallDraft,
  validateCallDraft,
} from './client-call-draft';

describe('defaultSectionsForCallType', () => {
  it('returns type-specific defaults', () => {
    assert.deepEqual(defaultSectionsForCallType('other'), ['key_points']);
    assert.deepEqual(defaultSectionsForCallType('checkin'), ['health', 'key_points']);
    assert.deepEqual(defaultSectionsForCallType('onboarding'), ['call_analysis', 'key_points']);
    assert.deepEqual(defaultSectionsForCallType('churn'), [
      'call_analysis',
      'concerns',
      'key_points',
    ]);
  });
});

describe('call log round-trip', () => {
  it('omits empty sections and blank action rows', () => {
    const draft = emptyCallLogDraft('checkin');
    draft.sections = ['key_points', 'action_items', 'wins'];
    draft.key_points = 'Discussed CPL';
    draft.wins = '  ';
    draft.action_items = [
      { text: 'Send report', owner: 'us' },
      { text: '   ', owner: 'client' },
    ];

    const stored = callLogDraftToStored(draft);
    assert.deepEqual(stored, {
      call_sections: ['key_points', 'action_items', 'wins'],
      key_points: 'Discussed CPL',
      action_items: [{ text: 'Send report', owner: 'us' }],
    });
  });

  it('maps legacy check-in fields on read', () => {
    const stored = parseCallLogFormInput({
      client_sentiment: 'concerned',
      what_went_well: 'Good leads',
      concerns_raised: 'Show rate',
      our_action_items: 'Audit dials',
      client_action_items: 'Share LO calendar',
    });
    assert.equal(stored?.wins, 'Good leads');
    assert.equal(stored?.concerns, 'Show rate');
    assert.deepEqual(stored?.action_items, [
      { text: 'Audit dials', owner: 'us' },
      { text: 'Share LO calendar', owner: 'client' },
    ]);
    assert.equal(stored?.health?.client_sentiment, 'concerned');

    const draft = storedToCallLogDraft(stored);
    for (const id of ['wins', 'concerns', 'action_items', 'health'] as const) {
      assert.ok(draft.sections.includes(id), `expected section ${id}`);
    }
    assert.equal(draft.wins, 'Good leads');
    assert.equal(draft.action_items.length, 2);
  });

  it('restores call_sections when present', () => {
    const draft = storedToCallLogDraft({
      call_sections: ['key_points', 'transcript'],
      key_points: 'Only this',
    });
    assert.deepEqual(draft.sections, ['key_points', 'transcript']);
  });
});

describe('validateCallDraft', () => {
  it('requires client (when asked) and recording link', () => {
    const d = defaultCallDraft('', 'other');
    assert.equal(validateCallDraft(d, true), 'Select a client');
    d.client_id = 'abc';
    assert.equal(validateCallDraft(d, true), 'Call / recording link is required');
    d.recording_url = 'https://example.com/r';
    assert.equal(validateCallDraft(d, true), null);
  });

  it('does not require sentiment for check-ins', () => {
    const d = defaultCallDraft('c1', 'checkin');
    d.recording_url = 'https://example.com/r';
    assert.equal(validateCallDraft(d, true), null);
  });
});

describe('callDraftToApiBody', () => {
  it('always sends recording_url and checkin_form for any type', () => {
    const d = defaultCallDraft('c1', 'other');
    d.recording_url = 'https://rec.test/1';
    d.log.key_points = 'Coaching notes';
    d.log.sections = ['key_points'];
    const body = callDraftToApiBody(d);
    assert.equal(body.recording_url, 'https://rec.test/1');
    assert.deepEqual(body.checkin_form, {
      call_sections: ['key_points'],
      key_points: 'Coaching notes',
    });
  });
});
