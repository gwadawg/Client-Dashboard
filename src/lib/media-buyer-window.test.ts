import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueAdNames } from './media-buyer-window';

describe('uniqueAdNames', () => {
  it('dedupes case-insensitively and drops empties', () => {
    assert.deepEqual(uniqueAdNames(['  Foo  ', 'foo', '', 'Bar', 'BAR']), ['Foo', 'Bar']);
  });
});
