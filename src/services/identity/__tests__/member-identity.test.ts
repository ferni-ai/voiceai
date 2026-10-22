/**
 * isMemberIdentity is an allowlist: only a real member's id may have data
 * stored, read back or acted on. The old `!== 'anonymous'` blocklist let
 * per-session strangers (anon:) and the third party on a call Ferni places
 * (onbehalf:) through, so scores, memories and outreach could be written about
 * them. Every prefix the module doc lists has a row here.
 */
import { describe, expect, it } from 'vitest';
import { isMemberIdentity } from '../member-identity.js';

describe('isMemberIdentity', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['anonymous placeholder', 'anonymous'],
    ['placeholder in another case', 'Anonymous'],
    ['padded placeholder', ' anonymous '],
    ['unknown placeholder', 'unknown'],
    ['default placeholder', 'default'],
    ['shared placeholder', 'shared'],
    ['unrecognised caller', 'anon:3b0e7c1e-0000-4000-8000-000000000000'],
    ['unrecognised caller, padded and upper case', '  ANON:abc'],
    ['third party on a call placed for a member', 'onbehalf:call-123'],
    ['third party, upper case', 'ONBEHALF:call-123'],
    ['placeholder in upper case', 'SHARED'],
  ])('refuses %s', (_label, id) => {
    expect(isMemberIdentity(id)).toBe(false);
  });

  it.each([
    ['an account uid', 'uid-0000000000000000000000000001'],
    ['a caller recognised by number', 'phone:+15555550100'],
    ['a member before sign-in', 'device:0f1e2d3c'],
    ['a sponsored family member', 'family_sponsored_1700000000000_ab12cd'],
    ['a caller identified through an auth provider', 'auth:google:0000000001'],
    ['a voice-eval caller (evals check memory)', 'voice-eval-sam'],
    ['an e2e account', 'e2e-run-1'],
    ['an id that merely contains a placeholder word', 'anonymous-but-real-uid'],
    ['an id that contains anon: later on', 'uid-anon:x'],
  ])('accepts %s', (_label, id) => {
    expect(isMemberIdentity(id)).toBe(true);
  });
});
