import assert from 'node:assert/strict';
import {
  CALL_CENTER_CREDIT_CALENDAR_NAME,
  creditQueueEventOrFilter,
  creditQueueUncreditedAgentOrFilter,
  isCreditQueueEligibleEvent,
  LEGACY_AI_CREDIT_CALENDAR_NAME,
  needsAgentCredit,
} from '../src/lib/credit-queue-eligibility';

assert.equal(needsAgentCredit(null), true);
assert.equal(needsAgentCredit(''), true);
assert.equal(needsAgentCredit('#N/A'), true);
assert.equal(needsAgentCredit('Luka Faccini'), false);

assert.equal(isCreditQueueEligibleEvent('live_transfer', null), true);
assert.equal(
  isCreditQueueEligibleEvent('appointment_booked', CALL_CENTER_CREDIT_CALENDAR_NAME),
  true,
);
assert.equal(
  isCreditQueueEligibleEvent('appointment_booked', LEGACY_AI_CREDIT_CALENDAR_NAME, null),
  true,
);
assert.equal(
  isCreditQueueEligibleEvent('appointment_booked', LEGACY_AI_CREDIT_CALENDAR_NAME, '#N/A'),
  false,
);
assert.equal(
  isCreditQueueEligibleEvent('appointment_booked', 'AI Booking Calendar', 'Luka Faccini'),
  true,
);
assert.equal(isCreditQueueEligibleEvent('appointment_booked', 'AI Booking Calendar'), true);

const filter = creditQueueEventOrFilter();
assert.match(filter, /event_type\.eq\.live_transfer/);
assert.match(filter, /Call Center Booking Calendar/);
assert.match(filter, /AI Booking Calendar/);
assert.match(filter, /agent_name\.isdistinct/);

assert.match(creditQueueUncreditedAgentOrFilter(), /#N\/A/);

console.log('credit-queue-eligibility: ok');
