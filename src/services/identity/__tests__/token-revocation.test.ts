/**
 * The account check on an ID token (#3208 review): cached, fail-closed on a lookup it
 * can't make, and no lookups spent on anonymous accounts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log, getLogger: () => log }));

import { revocationCheck, type AccountRecord } from '../token-revocation.js';

const T0 = Date.parse('2026-10-31T12:00:00.000Z');
const MINUTE = 60_000;
const token = (uid: string, signedInAt = T0 - 10 * MINUTE) => ({
  uid,
  auth_time: signedInAt / 1000,
  firebase: { sign_in_provider: 'password' },
});
const live: AccountRecord = { disabled: false };
const outage = () =>
  Promise.reject(Object.assign(new Error('unavailable'), { code: 'auth/internal-error' }));

beforeEach(() => vi.clearAllMocks());

describe('token revocation check', () => {
  it('a revoked token is refused', async () => {
    const check = revocationCheck();
    const lookup = vi.fn(async () => ({
      disabled: false,
      tokensValidAfterTime: new Date(T0 - MINUTE).toUTCString(),
    }));

    expect(await check(token('u-revoked'), lookup, T0)).toBe('revoked');
  });

  it('a deleted or disabled account is refused', async () => {
    const check = revocationCheck();
    const gone = vi.fn(() =>
      Promise.reject(Object.assign(new Error('x'), { code: 'auth/user-not-found' }))
    );

    expect(await check(token('u-gone'), gone, T0)).toBe('gone');
    expect(await check(token('u-disabled'), async () => ({ disabled: true }), T0)).toBe('disabled');
  });

  it('a fresh cache entry is used: one lookup a minute per account', async () => {
    const check = revocationCheck();
    const lookup = vi.fn(async () => live);

    for (let s = 0; s < 30; s += 2)
      expect(await check(token('u-poll'), lookup, T0 + s * 1000)).toBe('ok');
    expect(lookup).toHaveBeenCalledTimes(1);

    await check(token('u-poll'), lookup, T0 + MINUTE + 1);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('a lookup error with a state under an hour old uses that state, and logs it as stale', async () => {
    const check = revocationCheck();
    await check(token('u-known'), async () => live, T0);
    await check(token('u-off'), async () => ({ disabled: true }), T0);

    expect(await check(token('u-known'), outage, T0 + 30 * MINUTE)).toBe('stale');
    expect(await check(token('u-off'), outage, T0 + 30 * MINUTE)).toBe('disabled');
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth_revocation_stale' }),
      expect.any(String)
    );
  });

  it('a lookup error with no state under an hour old is unavailable (a 503), never a pass', async () => {
    const check = revocationCheck();
    await check(token('u-old'), async () => live, T0);

    expect(await check(token('u-new'), outage, T0)).toBe('unavailable');
    expect(await check(token('u-old'), outage, T0 + 61 * MINUTE)).toBe('unavailable');
  });

  it('an anonymous account is never looked up', async () => {
    const check = revocationCheck();
    const lookup = vi.fn(async () => live);
    const anon = { ...token('u-anon'), firebase: { sign_in_provider: 'anonymous' } };

    expect(await check(anon, lookup, T0)).toBe('anonymous');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('uncached lookups share a bucket: past it, new accounts are unavailable until it refills', async () => {
    const check = revocationCheck(3, 1); // a burst of 3, then 1 a second
    const lookup = vi.fn(async () => live);

    const results = [];
    for (const uid of ['b1', 'b2', 'b3', 'b4']) results.push(await check(token(uid), lookup, T0));

    expect(results).toEqual(['ok', 'ok', 'ok', 'unavailable']);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(await check(token('b4'), lookup, T0 + 1000)).toBe('ok');
  });

  it('logs the unavailable count once a minute, not per request', async () => {
    const check = revocationCheck();
    for (let i = 0; i < 20; i += 1) await check(token(`u-down-${i}`), outage, T0 + i);

    const lines = log.warn.mock.calls.filter(([f]) => f.event === 'auth_revocation_unavailable');
    expect(lines).toHaveLength(1);
  });
  describe('strict (approval, consent, payment and step-up checks)', () => {
    it('a lookup error is unavailable (a 503), even with a fresh state cached', async () => {
      const check = revocationCheck();
      await check(token('s-known'), async () => live, T0);

      expect(await check(token('s-known'), outage, T0 + 1000, true)).toBe('unavailable');
    });

    it('a cached state is never used: it looks the account up now', async () => {
      const check = revocationCheck();
      await check(token('s-cached'), async () => live, T0); // cached as live
      const revokedNow = vi.fn(async () => ({
        disabled: false,
        tokensValidAfterTime: new Date(T0 - MINUTE).toUTCString(),
      }));

      expect(await check(token('s-cached'), revokedNow, T0 + 1000, true)).toBe('revoked');
      expect(revokedNow).toHaveBeenCalledTimes(1);
    });

    it('a revoked token is refused, a live one passes, an anonymous one is looked up too', async () => {
      const check = revocationCheck();
      const lookup = vi.fn(async () => live);
      const anon = { ...token('s-anon'), firebase: { sign_in_provider: 'anonymous' } };

      expect(await check(token('s-live'), lookup, T0, true)).toBe('ok');
      expect(await check(anon, lookup, T0, true)).toBe('ok');
      expect(lookup).toHaveBeenCalledTimes(2);
    });
  });
});
