import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listableInternalForms } from '@/lib/internal-forms';
import {
  hasWelcomeBackSubmittedAfterCutoff,
  parseWelcomeBackFormFields,
  prefillFromClientRow,
  welcomeBackToClientPatch,
  welcomeBackTokenExpired,
} from '@/lib/welcome-back-onboarding';

const VALID = {
  primary_contact_name: 'Jordan Hale',
  email: 'jordan@example.com',
  phone: '5551234567',
  brokerage_name: 'Hale Lending',
  legal_business_name: 'Hale Lending LLC',
  nmls: '123456',
  city: 'Austin',
  state: 'tx',
  zip_code: '78701',
  street_address: '100 Main St',
  states_licensed: ['TX', 'OK'],
  timezone: 'America/Chicago',
  website: 'https://halelending.example',
  facebook_page_name: 'Hale Lending',
  contact_role: 'MLO',
  biography: 'Returning LO',
};

describe('welcome-back-onboarding', () => {
  it('parses allowlisted fields and uppercases state', () => {
    const input = parseWelcomeBackFormFields(VALID);
    assert.equal(input.state, 'TX');
    assert.deepEqual(input.states_licensed, ['OK', 'TX']);
  });

  it('rejects unknown contact roles', () => {
    assert.throws(
      () => parseWelcomeBackFormFields({ ...VALID, contact_role: 'CEO' }),
      /valid contact role/i,
    );
  });

  it('builds a contact/business patch without lifecycle fields', () => {
    const patch = welcomeBackToClientPatch(
      parseWelcomeBackFormFields({
        ...VALID,
        lifecycle_status: 'active',
        mrr: 99999,
        ghl_location_id: 'loc_hack',
        welcome_back_token: 'newtok',
        name: 'Hacked Name',
      }),
    );
    assert.equal(patch.email, 'jordan@example.com');
    assert.equal(patch.billing_email, 'jordan@example.com');
    assert.equal(patch.primary_contact_name, 'Jordan Hale');
    assert.equal(patch.primary_contact, 'Jordan Hale');
    assert.equal(patch.lifecycle_status, undefined);
    assert.equal(patch.mrr, undefined);
    assert.equal(patch.ghl_location_id, undefined);
    assert.equal(patch.welcome_back_token, undefined);
    assert.equal(patch.name, undefined);
  });

  it('prefills safe fields and omits id / secrets', () => {
    const prefill = prefillFromClientRow({
      id: 'secret-id',
      name: 'Acme Lending',
      primary_contact_name: 'Jordan Hale',
      email: 'jordan@acme.test',
      mrr: 5000,
      ghl_location_id: 'loc_secret',
      welcome_back_token: 'tok_secret',
      states_licensed: ['TX', 'FL'],
    });
    assert.equal(prefill.name, 'Acme Lending');
    assert.deepEqual(prefill.states_licensed, ['FL', 'TX']);
    assert.equal('id' in prefill, false);
    assert.equal('mrr' in prefill, false);
    assert.equal('welcome_back_token' in prefill, false);
  });

  it('treats reinstate_onboarding after cutoff as already submitted', () => {
    assert.equal(
      hasWelcomeBackSubmittedAfterCutoff([
        { form_type: 'reinstate', submitted_at: '2026-09-01T00:00:00.000Z', status: 'applied' },
        {
          form_type: 'reinstate_onboarding',
          submitted_at: '2026-09-02T00:00:00.000Z',
          status: 'applied',
        },
      ]),
      true,
    );
    assert.equal(
      hasWelcomeBackSubmittedAfterCutoff([
        { form_type: 'reinstate', submitted_at: '2026-09-01T00:00:00.000Z', status: 'applied' },
        {
          form_type: 'reinstate_onboarding',
          submitted_at: '2025-01-02T00:00:00.000Z',
          status: 'applied',
        },
      ]),
      false,
    );
  });

  it('keeps onboard-welcome-back out of public form hubs', () => {
    assert.equal(
      listableInternalForms().some((f) => f.slug === 'onboard-welcome-back'),
      false,
    );
  });

  it('expires welcome-back tokens older than TTL', () => {
    const now = Date.parse('2026-09-17T12:00:00.000Z');
    assert.equal(welcomeBackTokenExpired(null, now), false);
    assert.equal(welcomeBackTokenExpired('2026-09-10T12:00:00.000Z', now), false);
    assert.equal(welcomeBackTokenExpired('2026-08-01T12:00:00.000Z', now), true);
  });
});
