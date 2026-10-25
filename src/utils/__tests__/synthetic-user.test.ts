/**
 * Which ids are one real person's own account. Jobs that sweep accounts
 * (daily outreach) rely on this to skip eval, stranger and on-behalf ids.
 */
import { describe, expect, it } from 'vitest';
import { isPersonAccountId, isSyntheticUserId, nonAccountPrefixOf } from '../synthetic-user.js';

describe('isPersonAccountId', () => {
  it('accepts account ids, including device: and phone: ones', () => {
    for (const id of ['AbC123xyz', 'real-account-1', 'device:device-9f3a', 'phone:+15555550100'])
      expect(isPersonAccountId(id), id).toBe(true);
  });

  it('rejects anon: and onbehalf: session ids', () => {
    for (const id of ['anon:3f2a', 'anon:eval-7', 'onbehalf:call-1', ' anon:3f2a', 'ANON:3f2a'])
      expect(isPersonAccountId(id), id).toBe(false);
  });

  it('rejects test harness ids and placeholders', () => {
    for (const id of ['voice-eval-sam', 'e2e-memtest-1', 'device:debug-3', 'anonymous', 'Shared'])
      expect(isPersonAccountId(id), id).toBe(false);
    for (const id of ['', '   ', undefined, null]) expect(isPersonAccountId(id)).toBe(false);
  });

  it('leaves isSyntheticUserId as it was: anon: is not a test harness', () => {
    expect(isSyntheticUserId('anon:3f2a')).toBe(false);
    expect(isSyntheticUserId('onbehalf:call-1')).toBe(false);
    expect(isSyntheticUserId('voice-eval-sam')).toBe(true);
  });
});

describe('nonAccountPrefixOf', () => {
  it('names the prefix only when the id starts with it', () => {
    expect(nonAccountPrefixOf('anon:3f2a')).toBe('anon:');
    expect(nonAccountPrefixOf('onbehalf:call-1')).toBe('onbehalf:');
    expect(nonAccountPrefixOf('real-anon:1')).toBeUndefined();
    // A page cursor jumps past the prefix range, so a leading space must not match.
    expect(nonAccountPrefixOf(' anon:3f2a')).toBeUndefined();
  });
});
