/**
 * isUnverifiedUserId: ids minted per session or supplied by the caller (anon:,
 * device:, phone:) and placeholders are unverified; an account uid is not.
 */
import { describe, expect, it } from 'vitest';
import { isUnverifiedUserId } from '../unverified-user-id.js';

describe('isUnverifiedUserId', () => {
  it('treats missing ids and placeholders as unverified', () => {
    for (const id of [
      undefined,
      null,
      '',
      '  ',
      'anonymous',
      'Anonymous',
      'default',
      'unknown',
      'shared',
    ]) {
      expect(isUnverifiedUserId(id), String(id)).toBe(true);
    }
  });

  it('treats anon:, device: and phone: ids as unverified', () => {
    expect(isUnverifiedUserId('anon:3b0e7c1e-0000-4000-8000-000000000000')).toBe(true);
    expect(isUnverifiedUserId('device:client-chosen')).toBe(true);
    expect(isUnverifiedUserId('phone:+14155550134')).toBe(true);
  });

  it('treats an account uid as verified', () => {
    expect(isUnverifiedUserId('Kx9fQ2aBcDeFgHiJkLmNoPqRsTu1')).toBe(false);
    expect(isUnverifiedUserId('user-123')).toBe(false);
  });
});
