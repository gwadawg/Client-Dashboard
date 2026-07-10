import assert from 'node:assert/strict';
import {
  detectDuplicateLeadGroups,
  isCallRepLeadCreditConflict,
  type PayrollReviewLineItem,
} from './payroll-line-item-duplicates';

function item(
  id: string,
  type: string,
  phone = '5551234567',
  name = 'Test Lead',
): PayrollReviewLineItem {
  return {
    event_id: id,
    date: '2026-06-15',
    type,
    lead_name: name,
    lead_phone: phone,
    client_name: 'Client',
    unit_pay: 1,
  };
}

assert.equal(isCallRepLeadCreditConflict([item('1', 'booking'), item('2', 'show')]), false);
assert.equal(isCallRepLeadCreditConflict([item('1', 'booking'), item('2', 'live_transfer')]), true);
assert.equal(isCallRepLeadCreditConflict([item('1', 'show'), item('2', 'live_transfer')]), true);
assert.equal(
  isCallRepLeadCreditConflict([item('1', 'booking'), item('2', 'show'), item('3', 'live_transfer')]),
  true,
);
assert.equal(isCallRepLeadCreditConflict([item('1', 'show'), item('2', 'show')]), true);
assert.equal(isCallRepLeadCreditConflict([item('1', 'booking'), item('2', 'booking')]), true);
assert.equal(isCallRepLeadCreditConflict([item('1', 'live_transfer'), item('2', 'live_transfer')]), true);

const bookingShowGroup = detectDuplicateLeadGroups([
  item('a', 'booking'),
  item('b', 'show'),
  item('c', 'booking', '9998887777'),
]);
assert.equal(bookingShowGroup.length, 0);

const tripleGroup = detectDuplicateLeadGroups([
  item('a', 'booking'),
  item('b', 'show'),
  item('c', 'live_transfer'),
]);
assert.equal(tripleGroup.length, 1);
assert.equal(tripleGroup[0].items.length, 3);

const doubleShow = detectDuplicateLeadGroups([item('a', 'show'), item('b', 'show')]);
assert.equal(doubleShow.length, 1);

console.log('payroll-line-item-duplicates: all tests passed');
