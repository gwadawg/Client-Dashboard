import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFinalizeClosePlan } from '@/lib/acquisition-close-finalize';

describe('resolveFinalizeClosePlan', () => {
  it('inserts when no existing close', () => {
    assert.deepEqual(resolveFinalizeClosePlan(null), { action: 'insert' });
  });

  it('updates the most recent standard close', () => {
    assert.deepEqual(
      resolveFinalizeClosePlan({ id: 'close-1', close_kind: 'standard' }),
      { action: 'update', id: 'close-1' },
    );
    assert.deepEqual(
      resolveFinalizeClosePlan({ id: 'close-2', close_kind: null }),
      { action: 'update', id: 'close-2' },
    );
  });

  it('leaves a reinstate close untouched', () => {
    assert.deepEqual(
      resolveFinalizeClosePlan({ id: 'winback-1', close_kind: 'reinstate' }),
      { action: 'skip_reinstate', id: 'winback-1' },
    );
  });
});
