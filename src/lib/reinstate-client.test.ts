import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWelcomeBackUrl,
  buildSameFileClientPatch,
} from '@/lib/reinstate-client';
import { emptyReinstateDraft } from '@/lib/reinstate-form';

describe('reinstate-client helpers', () => {
  it('builds welcome-back URL', () => {
    assert.equal(
      buildWelcomeBackUrl('https://app.example.com', 'tok_abc'),
      'https://app.example.com/onboard/welcome-back/tok_abc',
    );
  });

  it('keeps date_signed, sets reinstated_at, clears pauses', () => {
    const draft = emptyReinstateDraft();
    draft.mrr = 6000;
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.closed_at = '2026-09-17';
    draft.contract_end_date = '2027-09-17';
    const patch = buildSameFileClientPatch(draft, '2026-09-17T12:00:00.000Z');
    assert.equal(patch.date_signed, undefined);
    assert.equal(patch.reinstated_at, '2026-09-17T12:00:00.000Z');
    assert.equal(patch.lifecycle_status, 'onboarding');
    assert.equal(patch.churned_at, null);
    assert.equal(patch.is_live, false);
    assert.equal(patch.billing_paused, false);
    assert.equal(patch.ads_paused, false);
    assert.equal(patch.mrr, 6000);
  });

  it('respects leave_billing_paused and leave_ads_paused', () => {
    const draft = emptyReinstateDraft();
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.leave_billing_paused = true;
    draft.leave_ads_paused = true;
    const patch = buildSameFileClientPatch(draft, '2026-09-17T12:00:00.000Z');
    assert.equal(patch.billing_paused, undefined);
    assert.equal(patch.ads_paused, undefined);
    assert.equal(patch.churned_at, null);
    assert.equal(patch.is_live, false);
  });

  it('omits mrr when draft leaves it blank', () => {
    const draft = emptyReinstateDraft();
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.mrr = null;
    const patch = buildSameFileClientPatch(draft, '2026-09-17T12:00:00.000Z');
    assert.equal(patch.mrr, undefined);
  });
});
