/**
 * Onboarding side-effects — run: npx tsx scripts/verify-onboarding-side-effects.ts
 */
import assert from 'node:assert/strict';
import { formatOnboardingClickUpComment } from '../src/lib/onboarding-side-effects';
import type { OnboardingFormInput } from '../src/lib/onboarding-form';
import {
  buildGhlCsObContactPayload,
  formatOtherUserInformation,
  obRoleToOwnTheCompany,
} from '../src/lib/ghl-ob-contact-sync';
import { GHL_CS_OB_FIELD_DEFAULTS } from '../src/lib/ghl-api';
import { formatOnboardingUnmappedSlackMessage } from '../src/lib/slack-notify';

const sample: OnboardingFormInput = {
  form_variant: 'core',
  first_name: null,
  last_name: null,
  performance_unit: null,
  crm_choice: null,
  ob_role: 'mlo',
  account_management: 'solo',
  email: 'jane@example.com',
  phone: '(555) 123-4567',
  nmls: '123456',
  states_licensed: ['CA', 'TX'],
  street_address: '1 Main St',
  city: 'Austin',
  state: 'TX',
  zip_code: '78701',
  timezone: 'America/Chicago',
  brokerage_name: 'Acme Mortgage',
  legal_business_name: '',
  website: '',
  company_nmls: '',
  company_address: { street: '', city: '', state: '', zip: '' },
  company_states_licensed: [],
  biography: 'Experienced LO with 10 years in reverse.',
  review_url: 'https://example.com/reviews',
  headshot_url: 'https://cdn.example.com/head.jpg',
  additional_members: [],
};

const comment = formatOnboardingClickUpComment(sample, {
  name: "Jane Doe's Office",
  id: 'uuid-123',
});

assert.ok(comment.includes('Onboarding form submitted'));
assert.ok(comment.includes('jane@example.com'));
assert.ok(comment.includes('OB Form Filled') === false, 'comment should not include GHL tag name');
assert.ok(comment.includes('123456'));
assert.ok(comment.includes('CA, TX') || comment.includes('CA'));

console.log('verify-onboarding-side-effects: all assertions passed');

const unmapped = formatOnboardingUnmappedSlackMessage({
  email: 'jane@example.com',
  phone: '(555) 123-4567',
  match_count: 0,
  submission_id: 'sub-uuid',
  brokerage_name: 'Acme Mortgage',
  nmls: '123456',
});
assert.ok(unmapped.includes('could not match'));
assert.ok(unmapped.includes('No client file found'));
assert.ok(unmapped.includes('sub-uuid'));
assert.ok(unmapped.includes('GHL tag and ClickUp were'));

console.log('verify-onboarding-side-effects: unmapped slack assertions passed');

assert.equal(obRoleToOwnTheCompany('mlo'), 'MLO For Brokerage/Lender');
assert.equal(obRoleToOwnTheCompany('owner'), 'Owner of Brokerage/Lender');

const mloPayload = buildGhlCsObContactPayload(sample, GHL_CS_OB_FIELD_DEFAULTS);
assert.equal(mloPayload.address1, '1 Main St');
assert.equal(mloPayload.city, 'Austin');
assert.equal(mloPayload.state, 'TX');
assert.equal(mloPayload.postalCode, '78701');
assert.equal(mloPayload.companyName, 'Acme Mortgage');
assert.ok(mloPayload.customFields?.some(
  f => f.id === GHL_CS_OB_FIELD_DEFAULTS.own_the_company
    && f.field_value === 'MLO For Brokerage/Lender',
));
assert.ok(!mloPayload.customFields?.some(f => f.id === GHL_CS_OB_FIELD_DEFAULTS.company_nmls));
assert.ok(!mloPayload.customFields?.some(f => f.id === GHL_CS_OB_FIELD_DEFAULTS.company_website));

const owner: OnboardingFormInput = {
  ...sample,
  ob_role: 'owner',
  legal_business_name: 'Acme Mortgage LLC',
  brokerage_name: 'Acme Mortgage LLC',
  website: 'https://acme.example',
  company_nmls: '999888',
  street_address: '',
  zip_code: '',
  additional_members: [
    {
      contact_type: 'loa',
      name: 'Pat Helper',
      email: 'pat@example.com',
      phone: '5550001111',
      nmls: null,
      states_licensed: null,
    },
  ],
};
const ownerPayload = buildGhlCsObContactPayload(owner, GHL_CS_OB_FIELD_DEFAULTS);
assert.equal(ownerPayload.address1, undefined);
assert.equal(ownerPayload.postalCode, undefined);
assert.ok(ownerPayload.customFields?.some(
  f => f.id === GHL_CS_OB_FIELD_DEFAULTS.company_nmls && f.field_value === '999888',
));
assert.ok(ownerPayload.customFields?.some(
  f => f.id === GHL_CS_OB_FIELD_DEFAULTS.company_website && f.field_value === 'https://acme.example',
));
const other = ownerPayload.customFields?.find(
  f => f.id === GHL_CS_OB_FIELD_DEFAULTS.other_user_information,
);
assert.ok(other?.field_value.includes('Role: LOA / Assistant'));
assert.ok(other?.field_value.includes('Name: Pat Helper'));
assert.ok(other?.field_value.includes('Email: pat@example.com'));

const otherFmt = formatOtherUserInformation(owner.additional_members);
assert.equal(otherFmt, other?.field_value);

console.log('verify-onboarding-side-effects: GHL CS OB payload assertions passed');
