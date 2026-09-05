import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactLicensedStates,
  countSecondaryRosterFilters,
  offerVisibleForStatusFilter,
} from './roster-media-view';

describe('compactLicensedStates', () => {
  it('returns empty display for null/empty', () => {
    assert.deepEqual(compactLicensedStates(null), { text: '—', title: undefined, muted: true });
    assert.deepEqual(compactLicensedStates([]), { text: '—', title: undefined, muted: true });
  });

  it('joins codes under the cap', () => {
    const r = compactLicensedStates(['CA', 'TX', 'FL'], 4);
    assert.equal(r.text, 'CA · TX · FL');
    assert.equal(r.title, 'CA, TX, FL');
    assert.equal(r.muted, false);
  });

  it('caps display and shows +N', () => {
    const r = compactLicensedStates(['CA', 'TX', 'FL', 'NY', 'WA', 'OR'], 4);
    assert.equal(r.text, 'CA · TX · FL · NY +2');
    assert.equal(r.title, 'CA, TX, FL, NY, WA, OR');
  });
});

describe('countSecondaryRosterFilters', () => {
  it('counts only non-all secondary filters', () => {
    assert.equal(
      countSecondaryRosterFilters({ offer: 'all', package: 'all', ads: 'all' }),
      0,
    );
    assert.equal(
      countSecondaryRosterFilters({ offer: 'dscr', package: 'all', ads: 'paused' }),
      2,
    );
  });
});

describe('offerVisibleForStatusFilter', () => {
  it('hides off_boarding and churned on all/active', () => {
    assert.equal(offerVisibleForStatusFilter('off_boarding', 'all'), false);
    assert.equal(offerVisibleForStatusFilter('churned', 'active'), false);
    assert.equal(offerVisibleForStatusFilter('active', 'all'), true);
    assert.equal(offerVisibleForStatusFilter('paused', 'all'), true);
  });

  it('shows all lifecycles on paused/churned/onboarding tabs', () => {
    assert.equal(offerVisibleForStatusFilter('churned', 'churned'), true);
    assert.equal(offerVisibleForStatusFilter('off_boarding', 'paused'), true);
    assert.equal(offerVisibleForStatusFilter('churned', 'onboarding'), true);
  });
});
