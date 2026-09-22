import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractGhlLocationId, splitGhlLocationInput } from '@/lib/ghl-location-id';

describe('extractGhlLocationId', () => {
  it('passes through bare ids', () => {
    assert.equal(extractGhlLocationId('79F3FanL050vuK7fF2G9'), '79F3FanL050vuK7fF2G9');
  });

  it('extracts id from GHL dashboard URL', () => {
    assert.equal(
      extractGhlLocationId(
        'https://app.gohighlevel.com/v2/location/79F3FanL050vuK7fF2G9/dashboard',
      ),
      '79F3FanL050vuK7fF2G9',
    );
  });

  it('rejects malformed URLs without a location segment', () => {
    assert.equal(extractGhlLocationId('https://example.com/foo'), null);
  });

  it('returns null for empty', () => {
    assert.equal(extractGhlLocationId('  '), null);
    assert.equal(extractGhlLocationId(null), null);
  });
});

describe('splitGhlLocationInput', () => {
  it('keeps URL when extracting id', () => {
    const url = 'https://app.gohighlevel.com/v2/location/abc123/dashboard';
    assert.deepEqual(splitGhlLocationInput(url), {
      ghl_location_id: 'abc123',
      ghl_subaccount_url: url,
    });
  });
});
