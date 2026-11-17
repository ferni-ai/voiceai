/**
 * The pure rules for a guest's yes: a yes said before a revoke on record
 * writes nothing, so it can never undo the stop that came after it.
 */
import { describe, expect, it } from 'vitest';
import {
  afterRevoke,
  afterYes,
  consentStands,
  GUEST_CONSENT_WORDING_VERSION,
  type GuestConsent,
} from '../guest-consent.js';

const V = GUEST_CONSENT_WORDING_VERSION;
const T1 = '2026-11-16T15:01:00.000Z';
const T2 = '2026-11-16T15:02:00.000Z';
const T3 = '2026-11-16T15:03:00.000Z';

const revokedAt = (at: string): GuestConsent => {
  const yes = afterYes(null, V, '2026-11-16T15:00:00.000Z', null);
  const revoked = afterRevoke(yes, at);
  if (!revoked) throw new Error('setup: the revoke was not applied');
  return revoked;
};

describe('afterYes', () => {
  it('writes nothing when the revoke on record (T2) is later than this yes (T1)', () => {
    const prev = revokedAt(T2);
    expect(afterYes(prev, V, T1, null)).toBeNull();
    expect(consentStands(prev)).toBe(false);
  });

  it('clears a revoke that came before this yes', () => {
    const next = afterYes(revokedAt(T2), V, T3, null);
    expect(next).not.toBeNull();
    expect(next?.revokedAt).toBeUndefined();
    expect(next?.consentedAt).toBe(T3);
    expect(consentStands(next)).toBe(true);
  });

  it('writes nothing when the revoke time on record cannot be read', () => {
    const prev: GuestConsent = { ...revokedAt(T2), revokedAt: 'not a time' };
    expect(afterYes(prev, V, T3, null)).toBeNull();
  });
});
