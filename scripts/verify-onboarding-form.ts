/**
 * Onboarding form payload verification — run: npx tsx scripts/verify-onboarding-form.ts
 */
import assert from 'node:assert/strict';
import {
  draftToSubmitBody,
  obRoleToContactRole,
  onboardingToClientPatch,
  parseOnboardingFormFields,
} from '../src/lib/onboarding-form';
import { validateStep } from '../src/lib/onboarding-steps';

function testMloPath() {
  const input = parseOnboardingFormFields({
    account_management: 'solo',
    ob_role: 'mlo',
    email: 'lo@example.com',
    phone: '5551234567',
    nmls: '123456',
    states_licensed: ['TX', 'CA'],
    brokerage_name: 'Acme Lending',
    city: 'Dallas',
    state: 'TX',
    timezone: 'America/Chicago',
    biography: 'Experienced LO.',
    review_url: '',
    additional_members: [],
  });

  assert.equal(input.ob_role, 'mlo');
  assert.equal(input.brokerage_name, 'Acme Lending');
  assert.equal(input.website, '');
  assert.equal(input.company_nmls, '');

  const patch = onboardingToClientPatch(input);
  assert.equal(patch.contact_role, 'MLO');
  assert.equal(patch.brokerage_name, 'Acme Lending');
  assert.equal(patch.nmls, '123456');
  assert.equal(patch.timezone, 'America/Chicago');
}

function testOwnerPath() {
  const input = parseOnboardingFormFields({
    account_management: 'partner',
    ob_role: 'owner',
    email: 'owner@example.com',
    phone: '5559876543',
    nmls: '654321',
    states_licensed: ['FL'],
    company_name: 'Sunshine Mortgage LLC',
    website: 'https://sunshine.example.com',
    company_nmls: '999888',
    company_street: '100 Main St',
    company_city: 'Miami',
    company_state: 'FL',
    company_zip: '33101',
    company_states_licensed: ['FL', 'GA'],
    city: 'Miami',
    state: 'FL',
    timezone: 'America/New_York',
    biography: 'Broker owner bio.',
    review_url: 'https://reviews.example.com/us',
    additional_members: [
      {
        contact_type: 'co_lo',
        name: 'Jane Partner',
        email: 'jane@example.com',
        phone: '5551112222',
        nmls: '111222',
        states_licensed: ['FL'],
        notes: null,
      },
    ],
  });

  assert.equal(input.legal_business_name, 'Sunshine Mortgage LLC');
  assert.equal(input.brokerage_name, 'Sunshine Mortgage LLC');
  assert.equal(input.website, 'https://sunshine.example.com');
  assert.equal(input.company_nmls, '999888');
  assert.equal(input.company_states_licensed.join(','), 'FL,GA');
  assert.equal(input.additional_members.length, 1);
  assert.equal(obRoleToContactRole('owner'), 'Broker Owner');
}

function testDraftToSubmitBody() {
  const body = draftToSubmitBody({
    account_management: 'solo',
    ob_role: 'mlo',
    brokerage_name: 'Test Co',
    company_name: '',
    website: '',
    company_nmls: '',
    company_address: { street: '', city: '', state: '', zip: '' },
    company_states_licensed: [],
    nmls: '1',
    phone: '555',
    email: 'a@b.com',
    states_licensed: ['TX'],
    street_address: '',
    city: 'Austin',
    state: 'TX',
    zip_code: '',
    timezone: 'America/Chicago',
    review_url: '',
    biography: 'Bio',
    additional_members: [],
  });
  assert.equal(body.ob_role, 'mlo');
  assert.equal(body.brokerage_name, 'Test Co');
  assert.ok(body.states_licensed.includes('TX'));
}

function testStepValidation() {
  const draft = {
    account_management: '' as const,
    ob_role: '' as const,
    brokerage_name: '',
    company_name: '',
    website: '',
    company_nmls: '',
    company_address: { street: '', city: '', state: '', zip: '' },
    company_states_licensed: [] as string[],
    nmls: '',
    phone: '',
    email: '',
    states_licensed: [] as string[],
    street_address: '',
    city: '',
    state: '',
    zip_code: '',
    timezone: '',
    review_url: '',
    biography: '',
    headshot: null,
    additional_members: [],
  };
  assert.ok(validateStep('management', { draft, memberDraft: { contact_type: '', name: '', email: '', phone: '', nmls: '', states_licensed: [] }, inMemberFlow: false }));
}

function testOwnerRequiresCompanyFields() {
  assert.throws(() => {
    parseOnboardingFormFields({
      account_management: 'solo',
      ob_role: 'owner',
      email: 'o@e.com',
      phone: '555',
      nmls: '1',
      states_licensed: ['TX'],
      company_name: 'Co',
      city: 'Austin',
      state: 'TX',
      timezone: 'America/Chicago',
      biography: 'x',
      additional_members: [],
    });
  }, /website/i);
}

testMloPath();
testOwnerPath();
testDraftToSubmitBody();
testStepValidation();
testOwnerRequiresCompanyFields();

console.log('verify-onboarding-form: all assertions passed');
