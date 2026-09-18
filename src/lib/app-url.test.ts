import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAppBaseUrl, getAppBaseUrlFromRequest } from '@/lib/app-url';

describe('getAppBaseUrl', () => {
  it('prefers a non-local request origin', () => {
    assert.equal(
      getAppBaseUrl('https://os.waizmedia.net'),
      'https://os.waizmedia.net',
    );
  });

  it('ignores localhost request origin and falls back to production', () => {
    assert.equal(getAppBaseUrl('https://localhost:8080'), 'https://os.waizmedia.net');
  });
});

describe('getAppBaseUrlFromRequest', () => {
  it('uses x-forwarded-host over localhost url', () => {
    const req = new Request('https://localhost:8080/api/clients/reinstate', {
      headers: {
        'x-forwarded-host': 'os.waizmedia.net',
        'x-forwarded-proto': 'https',
      },
    });
    assert.equal(getAppBaseUrlFromRequest(req), 'https://os.waizmedia.net');
  });
});
