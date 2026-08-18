import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  US_STATES,
  groupLicensedStates,
  usStateName,
} from './us-states';

describe('licensed state grouping', () => {
  it('looks up full names', () => {
    assert.equal(usStateName('TX'), 'Texas');
    assert.equal(usStateName('dc'), 'District of Columbia');
    assert.equal(usStateName('XX'), 'XX');
  });

  it('assigns every US state and DC to a region', () => {
    const grouped = groupLicensedStates(US_STATES.map(s => s.code));
    const assigned = grouped.flatMap(g => g.codes);
    assert.equal(assigned.length, US_STATES.length);
    assert.deepEqual([...assigned].sort(), [...US_STATES.map(s => s.code)].sort());
  });

  it('drops empty regions and keeps census order', () => {
    const groups = groupLicensedStates(['NY', 'CA', 'TX']);
    assert.deepEqual(groups.map(g => g.region), ['West', 'South', 'Northeast']);
    assert.deepEqual(groups.find(g => g.region === 'West')?.codes, ['CA']);
  });
});
