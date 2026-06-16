/**
 * Step 1 onboard payload verification — run: npx tsx scripts/verify-onboard-payload.ts
 */
import assert from 'node:assert/strict';
import { parseOnboardPayload } from '../src/lib/onboard-client';

function testStep1CorePayload() {
  const parsed = parseOnboardPayload({
    primary_contact_name: 'Jane Doe',
    lifecycle_status: 'new_account',
    email: 'jane@example.com',
    phone: '(555) 123-4567',
    date_signed: '2026-06-16',
    clickup_task_id: '86abc123',
    slack_id: 'C01234567',
  });

  assert.equal(parsed.primary_contact_name, 'Jane Doe');
  assert.equal(parsed.name, 'Jane Doe', 'name placeholder = person until kickoff');
  assert.equal(parsed.email, 'jane@example.com');
  assert.equal(parsed.billing_email, 'jane@example.com');
  assert.equal(parsed.phone, '(555) 123-4567');
  assert.equal(parsed.date_signed, '2026-06-16');
  assert.equal(parsed.clickup_task_id, '86abc123');
  assert.equal(parsed.slack_id, 'C01234567');
  assert.equal(parsed.lifecycle_status, 'new_account');
}

function testSubAccountNameOverridesPlaceholder() {
  const parsed = parseOnboardPayload({
    primary_contact_name: 'Jane Doe',
    sub_account_name: "Jane Doe's Office",
    email: 'jane@example.com',
  });
  assert.equal(parsed.name, "Jane Doe's Office");
  assert.equal(parsed.primary_contact_name, 'Jane Doe');
}

function testClickUpIdAliases() {
  const a = parseOnboardPayload({
    primary_contact_name: 'Test',
    clickup_id: 'id-from-alias',
  });
  assert.equal(a.clickup_task_id, 'id-from-alias');

  const b = parseOnboardPayload({
    primary_contact_name: 'Test',
    slackId: 'C999',
  });
  assert.equal(b.slack_id, 'C999');
}

function testDoesNotUseNameFieldAsSubAccountWhenOnlyPrimaryContactSent() {
  const parsed = parseOnboardPayload({
    primary_contact_name: 'Jane Doe',
    email: 'jane@example.com',
  });
  assert.equal(parsed.name, 'Jane Doe');
  assert.notEqual(parsed.name, undefined);
}

function testGhlContactFields() {
  const parsed = parseOnboardPayload({
    primary_contact_name: 'Jane Doe',
    contact_id: 'ghl-contact-abc',
  });
  assert.equal(parsed.ghl_contact_id, 'ghl-contact-abc');

  const alias = parseOnboardPayload({
    primary_contact_name: 'Jane Doe',
    ghl_contact_id: 'explicit-id',
  });
  assert.equal(alias.ghl_contact_id, 'explicit-id');
}

testStep1CorePayload();
testSubAccountNameOverridesPlaceholder();
testClickUpIdAliases();
testDoesNotUseNameFieldAsSubAccountWhenOnlyPrimaryContactSent();
testGhlContactFields();

console.log('verify-onboard-payload: all assertions passed');
