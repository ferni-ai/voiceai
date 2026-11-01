/**
 * One on-behalf predicate for every spelling of the id.
 *
 * isSharedPlaceholderId, isMemberIdentity and callerIdFor compare ids as
 * comparableId gives them (#2963). isThirdPartyCallUser used a bare
 * startsWith('onbehalf:'), so 'ONBEHALF:x' or a zero-width/full-width disguise
 * was "not a member" to the memory guards and "not third-party" to the
 * ONBEHALF_WRITE_GATE at once: writes under it went through, and fast capture,
 * the short-term buffer and knowledge capture did not skip it.
 *
 * Every case calls the production symbols; a member and an anon: id are run
 * beside each disguise so a pass can't come from the input alone.
 */
import { describe, expect, it } from 'vitest';
import { isThirdPartyCallUser } from '../../../memory/third-party-call.js';
import { ownerWriteId, ownerWritesBlocked } from '../owner-write-gate.js';
import { validateUserId } from '../../session/validation.js';
import { isMemberIdentity } from '../member-identity.js';

const GATE_ON = { ONBEHALF_WRITE_GATE: 'on' };
const GATE_OFF = { ONBEHALF_WRITE_GATE: 'off' };
const MEMBER = 'member-uid-1';

/** Spellings of an on-behalf id that a bare startsWith('onbehalf:') misses. */
const DISGUISED: ReadonlyArray<[string, string]> = [
  ['upper case', 'ONBEHALF:onbehalf_1760799649000_abcde'],
  ['mixed case', 'OnBehalf:call-1'],
  ['leading space', ' onbehalf:call-1'],
  ['leading tab', '\tonbehalf:call-1'],
  ['zero-width space inside the prefix', 'on​behalf:call-1'],
  ['leading BOM', '﻿onbehalf:call-1'],
  ['full-width letters', 'ｏｎｂｅｈａｌｆ:call-1'],
  ['full-width colon', 'onbehalf：call-1'],
];

describe('isThirdPartyCallUser agrees with the other identity predicates', () => {
  it.each(DISGUISED)('%s is the third party on an on-behalf call', (_label, id) => {
    expect(isThirdPartyCallUser(id)).toBe(true);
    // The memory guards already said "not a member"; now both sides agree.
    expect(isMemberIdentity(id)).toBe(false);
  });

  it('the plain minted id still counts', () => {
    expect(isThirdPartyCallUser('onbehalf:onbehalf_1760799649000_abcde')).toBe(true);
  });

  it('a bare onbehalf: prefix counts (third-party is the side that writes nothing)', () => {
    expect(isThirdPartyCallUser('onbehalf:')).toBe(true);
    expect(isThirdPartyCallUser(' ONBEHALF: ')).toBe(true);
  });

  it('members, anon: callers and placeholders stay false', () => {
    for (const id of [
      MEMBER,
      'anon:abc',
      'ANON:abc',
      ' anon:onbehalf:x', // an anon: id whose body happens to say onbehalf
      'anonymous',
      'shared',
      'onbehalfx', // no colon: not the prefix
      'member-onbehalf:x', // the prefix must lead
      '',
    ]) {
      expect(isThirdPartyCallUser(id), id).toBe(false);
    }
    expect(isThirdPartyCallUser(undefined)).toBe(false);
    expect(isThirdPartyCallUser(null)).toBe(false);
  });
});

describe('ONBEHALF_WRITE_GATE blocks a disguised on-behalf id', () => {
  it.each(DISGUISED)('%s: nothing is written under it with the gate on', (_label, id) => {
    expect(ownerWritesBlocked(id, GATE_ON)).toBe(true);
    expect(ownerWriteId(id, GATE_ON)).toBeUndefined();
  });

  it('a member still writes under its own id, and the kill switch still releases the gate', () => {
    expect(ownerWritesBlocked(MEMBER, GATE_ON)).toBe(false);
    expect(ownerWriteId(MEMBER, GATE_ON)).toBe(MEMBER);
    expect(ownerWritesBlocked('anon:abc', GATE_ON)).toBe(false);

    const [, disguised] = DISGUISED[0];
    expect(ownerWritesBlocked(disguised, GATE_OFF)).toBe(false);
    // Off, the id comes back exactly as given (never the comparable form).
    expect(ownerWriteId(disguised, GATE_OFF)).toBe(disguised);
  });
});

describe('no profile is loaded or created for a disguised on-behalf id', () => {
  it('validateUserId refuses one that otherwise passes its format check', () => {
    // 'ONBEHALF:x' matches USER_ID_PATTERN, so only the third-party check stops it.
    expect(validateUserId('ONBEHALF:call-1')).toBeUndefined();
    expect(validateUserId('OnBehalf:call-1')).toBeUndefined();
    expect(validateUserId(MEMBER)).toBe(MEMBER);
  });
});
