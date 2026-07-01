import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isKickoffIdentityFieldComplete,
  mergeIdentityFields,
  pickIdentitySource,
  resolveIdentityClientId,
  withIdentityProfile,
} from './client-identity';

describe('client-identity', () => {
  it('resolveIdentityClientId uses self when no link', () => {
    assert.equal(resolveIdentityClientId({ id: 'a', identity_client_id: null }), 'a');
    assert.equal(resolveIdentityClientId({ id: 'b', identity_client_id: 'a' }), 'a');
  });

  it('mergeIdentityFields fills gaps without overwriting offer row', () => {
    const offer = {
      id: 'offer',
      name: 'Jane Doe DSCR',
      phone: '',
      nmls: '123',
      reporting_type: 'DSCR',
      states_licensed: null as string[] | null,
    };
    const identity = {
      id: 'identity',
      name: 'Jane Doe RM',
      phone: '555-0100',
      nmls: '123',
      states_licensed: ['FL'],
      reporting_type: 'RM',
    };
    const merged = withIdentityProfile(offer, identity);
    assert.equal(merged.name, 'Jane Doe DSCR');
    assert.equal(merged.phone, '555-0100');
    assert.deepEqual(merged.states_licensed, ['FL']);
    assert.equal(merged.reporting_type, 'DSCR');
  });

  it('pickIdentitySource prefers the row with more identity fields', () => {
    const sparse = { id: '1', name: 'A', phone: '1' };
    const rich = { id: '2', name: 'B', phone: '1', nmls: '99', website: 'https://x.com' };
    assert.equal(pickIdentitySource([sparse, rich]).id, '2');
  });

  it('isKickoffIdentityFieldComplete requires all kickoff identity keys', () => {
    assert.equal(
      isKickoffIdentityFieldComplete({
        phone: '555',
        contact_role: 'MLO',
        states_licensed: ['FL'],
        nmls: '1',
        brokerage_name: 'Co',
        timezone: 'America/New_York',
      }),
      true,
    );
    assert.equal(
      isKickoffIdentityFieldComplete({
        phone: '555',
        contact_role: '',
        states_licensed: [],
        nmls: '1',
        brokerage_name: 'Co',
        timezone: 'America/New_York',
      }),
      false,
    );
  });

  it('mergeIdentityFields does not copy empty arrays', () => {
    const base = { id: '1', name: 'X', states_licensed: ['TX'] };
    const source = { id: '2', name: 'Y', states_licensed: [] };
    assert.deepEqual(mergeIdentityFields(base, source).states_licensed, ['TX']);
  });
});
