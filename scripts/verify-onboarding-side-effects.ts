/**
 * Onboarding side-effects comment formatter — run: npx tsx scripts/verify-onboarding-side-effects.ts
 */
import assert from 'node:assert/strict';
import { formatOnboardingClickUpComment } from '../src/lib/onboarding-side-effects';
import type { OnboardingFormInput } from '../src/lib/onboarding-form';
import { formatOnboardingUnmappedSlackMessage } from '../src/lib/slack-notify';

const sample: OnboardingFormInput = {
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
assert.ok(comment.includes('OB form Filled') === false, 'comment should not include GHL tag name');
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
