import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clientNamesMatch } from './client-name-match';
import { pendingEventMatchesClient } from './pending-events';

describe('pending event client matching', () => {
  it('matches roster clients by normalized sub-account name', () => {
    assert.equal(
      pendingEventMatchesClient(
        { client_name: "JP Dauber's Office", ghl_location_id: null },
        { name: "JP Dauber's Office", ghl_location_id: 'abc' },
      ),
      true,
    );
    assert.equal(
      pendingEventMatchesClient(
        { client_name: 'Ali Sahrai (OLD)', ghl_location_id: null },
        { name: "Ali Sahrai's Office", ghl_location_id: null },
      ),
      false,
    );
  });

  it('matches by ghl location id even when names differ', () => {
    assert.equal(
      pendingEventMatchesClient(
        { client_name: 'Not Synced', ghl_location_id: 'loc-1' },
        { name: 'Real Client', ghl_location_id: 'loc-1' },
      ),
      true,
    );
  });
});

describe('client name normalization', () => {
  it('treats apostrophe variants as the same name', () => {
    assert.equal(clientNamesMatch("Mike Lena's Office", 'Mike Lenas Office'), true);
    assert.equal(
      clientNamesMatch('Community First National Bank', 'community first national bank'),
      true,
    );
  });

  it('aliases Dave Bancroft office name to Green Monarch Inc', () => {
    assert.equal(clientNamesMatch("Dave Bancroft's Office", 'Green Monarch Inc'), true);
    assert.equal(clientNamesMatch("dave bancroft's office", 'green monarch inc'), true);
    assert.equal(
      pendingEventMatchesClient(
        { client_name: "Dave Bancroft's Office", ghl_location_id: null },
        { name: 'Green Monarch Inc', ghl_location_id: 'TqH2sR3WGN14dD4sacTf' },
      ),
      true,
    );
  });
});
