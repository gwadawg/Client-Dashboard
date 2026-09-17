import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CS_REINSTATE_CHECKLIST,
  emptyReinstateDraft,
  mergeCsChecklistPatch,
  parseReinstateDraftFromBody,
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

  it('parses POST body field names into a draft', () => {
    const draft = parseReinstateDraftFromBody({
      client_id: '11111111-1111-1111-1111-111111111111',
      engagement: 'new_offer',
      offer: 'RM',
      reporting_type: 'RM',
      sales_package: 'full',
      mrr: '5000',
      closed_at: '2026-09-17',
      closer_name: 'Alex Closer',
      cash_collected: 5000,
      contract_term_months: '12',
      contract_end_date: '2027-09-17',
      ghl_reuse: 'no',
      leave_billing_paused: true,
      leave_ads_paused: false,
      internal_notes: 'Winback',
    });
    assert.equal(draft.engagement, 'new_offer');
    assert.equal(draft.mrr, 5000);
    assert.equal(draft.contract_term_months, 12);
    assert.equal(draft.leave_billing_paused, true);
    assert.equal(draft.ghl_reuse, 'no');
    assert.equal(reinstateValidationError(draft), null);
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

  it('merges a partial cs_checklist PATCH onto existing responses', () => {
    const responses = reinstateDraftToResponses(emptyReinstateDraft());
    const merged = mergeCsChecklistPatch(responses, { billing_live: true, ghl_path_confirmed: true });
    assert.ok(merged);
    assert.equal(merged.billing_live, true);
    assert.equal(merged.ghl_path_confirmed, true);
    assert.equal(merged.ready_for_kickoff, false);
    assert.equal(mergeCsChecklistPatch(responses, null), null);
    assert.equal(mergeCsChecklistPatch(responses, { unknown: true }), null);
  });
});
