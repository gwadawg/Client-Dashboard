import assert from 'node:assert/strict';
import { buildTeamInviteUrl, generateTeamInviteToken } from '@/lib/team-invite';

const token = generateTeamInviteToken();
assert.ok(token.length >= 24);
assert.match(token, /^[A-Za-z0-9_-]+$/);

const url = buildTeamInviteUrl(token, 'https://example.com/');
assert.equal(url, `https://example.com/onboard/team/${encodeURIComponent(token)}`);

console.log('team-invite ok');
