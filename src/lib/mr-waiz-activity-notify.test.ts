import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  closebotStatusLabel,
  formatActorLabel,
  formatMrWaizActivityMessage,
  summarizeEodAccomplishments,
} from '@/lib/mr-waiz-activity-notify';

describe('formatActorLabel', () => {
  it('falls back to Unknown user', () => {
    assert.equal(formatActorLabel(null), 'Unknown user');
    assert.equal(formatActorLabel('  '), 'Unknown user');
    assert.equal(formatActorLabel('Sam'), 'Sam');
  });
});

describe('formatMrWaizActivityMessage', () => {
  it('includes who and work log details', () => {
    const text = formatMrWaizActivityMessage('client.work_log_created', 'Alex Rivera', {
      work_type: 'finding',
      client_name: 'Acme LO',
      title: 'CPL spike',
      status: 'in_progress',
      change_description: 'Landing page change',
    });
    assert.match(text, /Work log created/);
    assert.match(text, /Who: \*Alex Rivera\*/);
    assert.match(text, /Acme LO/);
    assert.match(text, /CPL spike/);
    assert.match(text, /Posted by Mr\. Waiz/);
  });

  it('formats closebot status transitions', () => {
    const text = formatMrWaizActivityMessage('closebot.ticket_status_changed', 'Sam', {
      client_name: 'Beta',
      from_status_label: 'New',
      to_status_label: 'Investigating',
      ticket_id: 'abc-123',
    });
    assert.match(text, /New → Investigating/);
    assert.match(text, /Who: \*Sam\*/);
  });

  it('formats EOD', () => {
    const text = formatMrWaizActivityMessage('team.eod_submitted', 'Jordan', {
      department_label: 'Media Buyer / Ops',
      agent_name: 'Jordan',
      work_date: '2026-08-21',
      accomplishments: 'Launched 2 ads',
    });
    assert.match(text, /EOD submitted/);
    assert.match(text, /Launched 2 ads/);
  });
});

describe('closebotStatusLabel / summarizeEodAccomplishments', () => {
  it('maps known ticket statuses', () => {
    assert.equal(closebotStatusLabel('resolved_updated_agent'), 'Resolved (updated agent)');
  });

  it('joins accomplishment arrays', () => {
    assert.equal(
      summarizeEodAccomplishments({ accomplishments: ['a', 'b'] }),
      'a; b',
    );
  });
});
