import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  todayYmdInCallCenterTz,
  ymdInTimeZone,
} from './time';

describe('ymdInTimeZone / todayYmdInCallCenterTz', () => {
  it('formats today in Sao Paulo after UTC midnight as still the prior local day', () => {
    // 2026-07-22T02:00Z = 2026-07-21 23:00 in America/Sao_Paulo (UTC-3)
    const ymd = todayYmdInCallCenterTz(
      new Date('2026-07-22T02:00:00.000Z'),
      'America/Sao_Paulo',
    );
    assert.equal(ymd, '2026-07-21');
  });

  it('counts a late-evening SP dial (UTC next day) as the SP calendar day', () => {
    // 22:00 SP on July 21 = 2026-07-22T01:00:00.000Z
    const day = ymdInTimeZone(
      new Date('2026-07-22T01:00:00.000Z'),
      'America/Sao_Paulo',
    );
    assert.equal(day, '2026-07-21');

    const todayStr = todayYmdInCallCenterTz(
      new Date('2026-07-22T02:00:00.000Z'),
      'America/Sao_Paulo',
    );
    assert.equal(day === todayStr, true);
  });

  it('does not use UTC ISO date prefix for SP evening instants', () => {
    const iso = '2026-07-22T01:00:00.000Z';
    const utcPrefix = iso.slice(0, 10);
    const spDay = ymdInTimeZone(new Date(iso), 'America/Sao_Paulo');
    assert.equal(utcPrefix, '2026-07-22');
    assert.equal(spDay, '2026-07-21');
    assert.notEqual(utcPrefix, spDay);
  });
});
