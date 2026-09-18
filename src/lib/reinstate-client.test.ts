import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWelcomeBackUrl,
  buildSameFileClientPatch,
  buildNewOfferIdentityPatch,
  buildReinstateCloseRow,
  findExistingReinstateClose,
  findRecentNewOfferTargetClientId,
  hasRecentSameFileReinstate,
  pickReusableNewOfferSibling,
  readReinstateEngagement,
  readTargetClientId,
  reinstateSubmissionMatchesOrigin,
  REINSTATE_NEW_OFFER_IDENTITY_FIELDS,
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

  it('copies allowlisted identity fields and never GHL/ClickUp/Slack ids', () => {
    const origin = {
      email: 'a@example.com',
      phone: '555',
      primary_contact_name: 'Alex',
      brokerage_name: 'Broker',
      legal_business_name: 'LLC',
      nmls: '1',
      city: 'Austin',
      state: 'TX',
      states_licensed: ['TX'],
      timezone: 'America/Chicago',
      website: 'https://example.com',
      facebook_page_name: 'Page',
      contact_role: 'MLO',
      headshot_url: 'https://cdn.example/h.jpg',
      ghl_location_id: 'loc_should_not_copy',
      ghl_contact_id: 'contact_should_not_copy',
      clickup_task_id: 'cu_should_not_copy',
      slack_id: 'C_should_not_copy',
    };
    const patch = buildNewOfferIdentityPatch(origin);
    assert.equal(patch.email, 'a@example.com');
    assert.equal(patch.headshot_url, 'https://cdn.example/h.jpg');
    assert.equal(patch.ghl_location_id, undefined);
    assert.equal(patch.ghl_contact_id, undefined);
    assert.equal(patch.clickup_task_id, undefined);
    assert.equal(patch.slack_id, undefined);
    for (const key of REINSTATE_NEW_OFFER_IDENTITY_FIELDS) {
      if (key in origin) assert.ok(key in patch, key);
    }
  });

  it('reads engagement and target_client_id from reinstate responses', () => {
    assert.equal(readReinstateEngagement({ engagement: 'new_offer' }), 'new_offer');
    assert.equal(readReinstateEngagement({ engagement: 'nope' }), null);
    assert.equal(
      readTargetClientId({ target_client_id: ' sib-1 ' }),
      'sib-1',
    );
    assert.equal(readTargetClientId({}), null);
  });

  it('finds new_offer target_client_id and same_file rows for idempotency', () => {
    const origin = 'origin-1';
    const sibling = 'sibling-1';
    const newOffer = {
      client_id: sibling,
      responses: {
        engagement: 'new_offer' as const,
        origin_client_id: origin,
        target_client_id: sibling,
      },
    };
    const sameFile = {
      client_id: origin,
      responses: { engagement: 'same_file' as const, target_client_id: origin },
    };
    assert.equal(reinstateSubmissionMatchesOrigin(newOffer, origin), true);
    assert.equal(findRecentNewOfferTargetClientId([newOffer]), sibling);
    assert.equal(hasRecentSameFileReinstate([newOffer]), false);
    assert.equal(hasRecentSameFileReinstate([sameFile]), true);
    assert.equal(findRecentNewOfferTargetClientId([sameFile]), null);
  });

  it('reuses partially-applied or same-named onboarding siblings', () => {
    const cutoff = '2026-09-16T00:00:00.000Z';
    const expectedName = 'Acme — RM';
    assert.equal(
      pickReusableNewOfferSibling(
        [
          {
            id: 'sib-token',
            created_at: '2026-09-17T10:00:00.000Z',
            lifecycle_status: 'onboarding',
            welcome_back_token: 'tok',
            name: expectedName,
          },
        ],
        { cutoffIso: cutoff, expectedName },
      ),
      'sib-token',
    );
    assert.equal(
      pickReusableNewOfferSibling(
        [
          {
            id: 'sib-name',
            created_at: '2026-09-17T10:00:00.000Z',
            lifecycle_status: 'onboarding',
            name: expectedName,
          },
        ],
        { cutoffIso: cutoff, expectedName },
      ),
      'sib-name',
    );
    assert.equal(
      pickReusableNewOfferSibling(
        [
          {
            id: 'sib-old',
            created_at: '2026-09-10T10:00:00.000Z',
            lifecycle_status: 'onboarding',
            welcome_back_token: 'tok',
            name: expectedName,
          },
        ],
        { cutoffIso: cutoff, expectedName },
      ),
      null,
    );
    assert.equal(
      pickReusableNewOfferSibling(
        [
          {
            id: 'sib-other',
            created_at: '2026-09-17T10:00:00.000Z',
            lifecycle_status: 'onboarding',
            name: 'Other Offer',
          },
        ],
        { cutoffIso: cutoff, expectedName },
      ),
      null,
    );
  });

  it('matches existing reinstate closes by submission id or inserted-after window', () => {
    assert.equal(
      findExistingReinstateClose(
        [
          {
            id: 'close-1',
            close_kind: 'reinstate',
            form_submission_id: 'sub-1',
            inserted_at: '2026-09-17T12:00:00.000Z',
          },
        ],
        { formSubmissionId: 'sub-1' },
      ),
      'close-1',
    );
    assert.equal(
      findExistingReinstateClose(
        [
          {
            id: 'close-2',
            close_kind: 'reinstate',
            form_submission_id: 'other',
            inserted_at: '2026-09-17T13:00:00.000Z',
          },
        ],
        { formSubmissionId: 'sub-2', submittedAt: '2026-09-17T12:30:00.000Z' },
      ),
      'close-2',
    );
    assert.equal(
      findExistingReinstateClose(
        [
          {
            id: 'close-std',
            close_kind: 'standard',
            form_submission_id: 'sub-1',
            inserted_at: '2026-09-17T13:00:00.000Z',
          },
        ],
        { formSubmissionId: 'sub-1', submittedAt: '2026-09-17T12:00:00.000Z' },
      ),
      null,
    );
  });

  it('stores closer in raw only and omits setter_name on reinstate closes', () => {
    const draft = emptyReinstateDraft();
    draft.closer_name = 'Alex Closer';
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.sales_package = 'core_offer';
    draft.closed_at = '2026-09-17';
    draft.cash_collected = 1500;
    draft.engagement = 'new_offer';
    draft.ghl_reuse = 'no';

    const row = buildReinstateCloseRow({
      clientId: 'sib-1',
      formSubmissionId: 'sub-1',
      draft,
      originClientId: 'origin-1',
      targetClientId: 'sib-1',
    });

    assert.equal('setter_name' in row, false);
    assert.equal(row.close_kind, 'reinstate');
    assert.equal(row.form_submission_id, 'sub-1');
    const raw = row.raw as Record<string, unknown>;
    assert.equal(raw.closer_name, 'Alex Closer');
    assert.equal(raw.close_kind, 'reinstate');
    assert.equal(raw.engagement, 'new_offer');
    assert.equal(raw.origin_client_id, 'origin-1');
    assert.equal(raw.target_client_id, 'sib-1');
    assert.equal(raw.reinstate, true);
  });
});
