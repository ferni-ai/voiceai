/**
 * The per-person allowance key follows the positive verified signal: a verified
 * caller is charged to their own `user:<id>`, an unverified one shares the
 * strangers' bucket (null) whatever their id looks like, and only a session
 * that never set the signal falls back to the id-shape check.
 */
import { describe, expect, it } from 'vitest';

import {
  isVerifiedIdentification,
  rememberVerifiedCaller,
  verifiedAllowanceKey,
  verifiedCallerId,
  verifiedCallerOfSession,
} from '../verified-caller.js';

/** The fallback: a denylist like isUnverifiedUserId */
const looksUnverified = (id: string): boolean => /^(anon|device|phone):/.test(id);

describe('verifiedAllowanceKey', () => {
  it('gives a verified caller their own bucket', () => {
    expect(verifiedAllowanceKey({ userId: 'uid-1', verifiedCaller: true }, looksUnverified)).toBe(
      'user:uid-1'
    );
  });

  it('shares the strangers bucket for an unverified caller, even with an account-shaped id', () => {
    expect(verifiedAllowanceKey({ userId: 'uid-1', verifiedCaller: false }, looksUnverified)).toBe(
      null
    );
  });

  it('falls back to the id shape only when the signal is missing', () => {
    expect(verifiedAllowanceKey({ userId: 'uid-1' }, looksUnverified)).toBe('user:uid-1');
    expect(verifiedAllowanceKey({ userId: 'anon:abc' }, looksUnverified)).toBe(null);
  });

  it('shares the strangers bucket when there is no user id', () => {
    expect(verifiedAllowanceKey({ verifiedCaller: true }, looksUnverified)).toBe(null);
    expect(verifiedAllowanceKey(undefined, looksUnverified)).toBe(null);
  });
});

describe('isVerifiedIdentification', () => {
  it('needs the source marked verified', () => {
    expect(isVerifiedIdentification({ type: 'web_auth', verified: true }, {})).toBe(true);
    expect(isVerifiedIdentification({ type: 'web_auth' }, {})).toBe(false);
    expect(isVerifiedIdentification({ type: 'phone', verified: false }, {})).toBe(false);
  });

  it('needs the signed-in account marker for a Firebase uid', () => {
    const firebase = { type: 'firebase', verified: true };
    expect(isVerifiedIdentification(firebase, { firebase_account: true })).toBe(true);
    expect(isVerifiedIdentification(firebase, { firebase_account: 'true' })).toBe(false);
    expect(isVerifiedIdentification(firebase, {})).toBe(false);
  });
});

describe('verifiedCallerId: only the boolean true the server set counts', () => {
  it('returns the id for verifiedCaller: true', () => {
    expect(verifiedCallerId({ userId: ' uid-1 ', verifiedCaller: true })).toBe('uid-1');
  });

  it.each([
    ['missing', { userId: 'uid-1' }],
    ['false', { userId: 'uid-1', verifiedCaller: false }],
    ['the string "true"', { userId: 'uid-1', verifiedCaller: 'true' }],
    ['the number 1', { userId: 'uid-1', verifiedCaller: 1 }],
    ['an object', { userId: 'uid-1', verifiedCaller: {} }],
    ['null userData', null],
  ])('is null when verifiedCaller is %s', (_, userData) => {
    expect(verifiedCallerId(userData)).toBeNull();
  });

  it.each(['phone:+15550100', 'device:fixture', 'anon:fixture', 'unknown', '  '])(
    'is null for %s even when marked verified',
    (userId) => {
      expect(verifiedCallerId({ userId, verifiedCaller: true })).toBeNull();
    }
  );
});

describe('verifiedCallerOfSession: the caller verified on a voice session, by its id', () => {
  it('returns the remembered caller for that session only', () => {
    rememberVerifiedCaller('session-AJ_v1-1700000000000', ' uid-1 ');
    expect(verifiedCallerOfSession('session-AJ_v1-1700000000000')).toBe('uid-1');
    expect(verifiedCallerOfSession('session-AJ_other-1700000000000')).toBeNull();
    expect(verifiedCallerOfSession(undefined)).toBeNull();
  });

  it.each(['phone:+15550100', 'anon:fixture', 'unknown', ''])('never remembers %s', (userId) => {
    rememberVerifiedCaller('session-AJ_v2-1700000000000', userId);
    expect(verifiedCallerOfSession('session-AJ_v2-1700000000000')).toBeNull();
  });
});
