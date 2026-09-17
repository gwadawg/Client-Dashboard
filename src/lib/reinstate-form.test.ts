import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CS_REINSTATE_CHECKLIST,
  emptyReinstateDraft,
  reinstateValidationError,
  reinstateDraftToResponses,
} from '@/lib/reinstate-form';

describe('reinstate-form', () => {
  it('requires client, engagement, offer, closer, signed date', () => {
    const err = reinstateValidationError(emptyReinstateDraft());
    assert.ok(err);
  });

  it('accepts a complete same_file draft', () => {
    const draft = emptyReinstateDraft();
    draft.client_id = '11111111-1111-1111-1111-111111111111';
    draft.engagement = 'same_file';
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.mrr = 5000;
    draft.closed_at = '2026-09-17';
    draft.closer_name = 'Alex Closer';
    draft.cash_collected = 5000;
    draft.ghl_reuse = 'yes';
    assert.equal(reinstateValidationError(draft), null);
    const responses = reinstateDraftToResponses(draft);
    assert.equal(responses.engagement, 'same_file');
    assert.equal(responses.ghl_reuse, 'yes');
  });

  it('rejects new_offer with ghl_reuse yes', () => {
    const draft = emptyReinstateDraft();
    draft.client_id = '11111111-1111-1111-1111-111111111111';
    draft.engagement = 'new_offer';
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.mrr = 5000;
    draft.closed_at = '2026-09-17';
    draft.closer_name = 'Alex Closer';
    draft.cash_collected = 5000;
    draft.ghl_reuse = 'yes';
    const err = reinstateValidationError(draft);
    assert.ok(err);
    assert.match(err, /cannot reuse/i);
  });

  it('initializes cs_checklist with all keys false', () => {
    const responses = reinstateDraftToResponses(emptyReinstateDraft());
    const checklist = responses.cs_checklist as Record<string, boolean>;
    assert.ok(checklist);
    for (const item of CS_REINSTATE_CHECKLIST) {
      assert.equal(checklist[item.key], false, `${item.key} should be false`);
    }
    assert.equal(checklist.meta_map_checked, false);
    assert.equal(Object.keys(checklist).length, CS_REINSTATE_CHECKLIST.length);
  });
});
