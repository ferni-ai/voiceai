/**
 * The account check on an ID token (#3208 reviews): cached, invalidated on revoke and
 * delete, stale only while Auth itself fails, budgeted (and a refused budget is a 503,
 * never a pass), and anonymous sign-ins skipped only while the account is still
 * anonymous.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log, getLogger: () => log }));

import { revocationCheck, type AccountRecord, type Limits } from '../token-revocation.js';

const T0 = Date.parse('2026-10-31T12:00:00.000Z');
const MINUTE = 60_000;
const token = (uid: string, provider = 'password') => ({
  uid,
  auth_time: (T0 - 10 * MINUTE) / 1000,
  firebase: { sign_in_provider: provider },
});
const live: AccountRecord = { disabled: false, providerData: [{ providerId: 'password' }] };
const revokedSince = (ms: number): AccountRecord => ({
  ...live,
  tokensValidAfterTime: new Date(ms).toUTCString(),
});
const failing = (code: string) => () => Promise.reject(Object.assign(new Error(code), { code }));
const outage = failing('auth/internal-error'); // Auth itself failing

const roomy = { burst: 1000, perSecond: 1000 };
const limitsWith = (overrides: Partial<Limits>): Limits => ({
  normal: roomy,
  normalPerAccount: roomy,
  strict: roomy,
  strictPerAccount: roomy,
  anonymous: roomy,
  anonymousPerAccount: roomy,
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('token revocation check', () => {
  it('a revoked, deleted or disabled account is refused', async () => {
    const { check } = revocationCheck();

    expect(await check(token('u-rev'), async () => revokedSince(T0 - MINUTE), T0)).toBe('revoked');
    expect(await check(token('u-gone'), failing('auth/user-not-found'), T0)).toBe('gone');
    expect(await check(token('u-off'), async () => ({ ...live, disabled: true }), T0)).toBe(
      'disabled'
    );
  });

  it('a fresh cache entry is used: one lookup a minute per account', async () => {
    const { check } = revocationCheck();
    const lookup = vi.fn(async () => live);

    for (let s = 0; s < 30; s += 2)
      expect(await check(token('u-poll'), lookup, T0 + s * 1000)).toBe('ok');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('revoking or deleting invalidates a fresh cache entry at once', async () => {
    const { check, invalidate } = revocationCheck();
    const lookup = vi.fn(async () => live);
    await check(token('u-a'), lookup, T0);
    await check(token('u-b'), lookup, T0);

    invalidate('u-a', 'revoked', T0 + 1000);
    invalidate('u-b', 'gone', T0 + 1000);

    expect(await check(token('u-a'), lookup, T0 + 2000)).toBe('revoked');
    expect(await check(token('u-b'), lookup, T0 + 2000)).toBe('gone');
    expect(lookup).toHaveBeenCalledTimes(2); // refused from the cache, without a lookup
  });

  it('Auth failing, with a state under an hour old: that state is used and logged as stale', async () => {
    const { check } = revocationCheck();
    await check(token('u-known'), async () => live, T0);
    await check(token('u-off'), async () => ({ ...live, disabled: true }), T0);

    expect(await check(token('u-known'), outage, T0 + 30 * MINUTE)).toBe('stale');
    expect(await check(token('u-off'), outage, T0 + 30 * MINUTE)).toBe('disabled');
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth_revocation_stale' }),
      expect.any(String)
    );
  });

  it('Auth failing with no state under an hour old is unavailable (a 503), never a pass', async () => {
    const { check } = revocationCheck();
    await check(token('u-old'), async () => live, T0);

    expect(await check(token('u-new'), outage, T0)).toBe('unavailable');
    expect(await check(token('u-old'), outage, T0 + 61 * MINUTE)).toBe('unavailable');
  });

  it('a failure that is not Auth failing (a quota, a bug) never uses the stale state', async () => {
    const { check } = revocationCheck();
    await check(token('u-q'), async () => live, T0);

    expect(await check(token('u-q'), failing('auth/quota-exceeded'), T0 + 2 * MINUTE)).toBe(
      'unavailable'
    );
    expect(await check(token('u-q'), failing('auth/invalid-argument'), T0 + 3 * MINUTE)).toBe(
      'unavailable'
    );
  });

  it('a refused budget is unavailable, even with a stale state that would pass', async () => {
    const { check } = revocationCheck(limitsWith({ normal: { burst: 1, perSecond: 0 } }));
    await check(token('u-drained'), async () => live, T0); // the bucket's one token

    const lookup = vi.fn(async () => live);
    expect(await check(token('u-drained'), lookup, T0 + 2 * MINUTE)).toBe('unavailable');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('lookups are limited per account as well as globally', async () => {
    const { check } = revocationCheck(
      limitsWith({
        normal: { burst: 3, perSecond: 0 },
        normalPerAccount: { burst: 1, perSecond: 0 },
      })
    );
    const lookup = vi.fn(async () => live);

    expect(await check(token('p1'), outage, T0)).toBe('unavailable'); // spends p1's one lookup
    expect(await check(token('p1'), lookup, T0 + 1)).toBe('unavailable'); // p1's own budget is empty
    expect(lookup).not.toHaveBeenCalled();
    for (const uid of ['p2', 'p3']) expect(await check(token(uid), lookup, T0 + 2)).toBe('ok');
    expect(await check(token('p4'), lookup, T0 + 3)).toBe('unavailable'); // the global 3 are spent
  });

  it('logs the unavailable count once a minute, not per request', async () => {
    const { check } = revocationCheck();
    for (let i = 0; i < 20; i += 1) await check(token(`u-down-${i}`), outage, T0 + i);

    const lines = log.warn.mock.calls.filter(([f]) => f.event === 'auth_revocation_unavailable');
    expect(lines).toHaveLength(1);
  });

  describe('anonymous sign-ins', () => {
    const anonymousAccount: AccountRecord = { disabled: false, providerData: [] };

    it('skip the lookup only while a cached record shows the account still anonymous', async () => {
      const { check } = revocationCheck();
      const lookup = vi.fn(async () => anonymousAccount);

      expect(await check(token('a1', 'anonymous'), lookup, T0)).toBe('ok'); // first sight: looked up
      expect(await check(token('a1', 'anonymous'), lookup, T0 + 30 * MINUTE)).toBe('anonymous');
      expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('an account upgraded to a real login is looked up, and its revoked anonymous token refused', async () => {
      const { check } = revocationCheck();
      const upgradedThenRevoked = vi.fn(async () => revokedSince(T0 - MINUTE));

      // First sight of the upgraded account: looked up, providers seen, refused
      expect(await check(token('a2', 'anonymous'), upgradedThenRevoked, T0)).toBe('revoked');
      // Past the fresh minute it is looked up again: a record with providers never skips
      expect(await check(token('a2', 'anonymous'), upgradedThenRevoked, T0 + 2 * MINUTE)).toBe(
        'revoked'
      );
      expect(upgradedThenRevoked).toHaveBeenCalledTimes(2);
    });

    it('have their own cheap budget, so they cannot drain normal lookups', async () => {
      const { check } = revocationCheck(limitsWith({ anonymous: { burst: 2, perSecond: 0 } }));
      const lookup = vi.fn(async () => anonymousAccount);

      for (const uid of ['n1', 'n2']) await check(token(uid, 'anonymous'), lookup, T0);
      expect(await check(token('n3', 'anonymous'), lookup, T0)).toBe('unavailable');
      expect(await check(token('real'), async () => live, T0)).toBe('ok');
    });
  });

  describe('strict (approval, consent, payment, erasure, key minting, step-up)', () => {
    it('a lookup error is unavailable (a 503), even with a fresh state cached', async () => {
      const { check } = revocationCheck();
      await check(token('s-known'), async () => live, T0);

      expect(await check(token('s-known'), outage, T0 + 1000, true)).toBe('unavailable');
    });

    it('a cached state is never used: it looks the account up now', async () => {
      const { check } = revocationCheck();
      await check(token('s-cached'), async () => live, T0);
      const revokedNow = vi.fn(async () => revokedSince(T0 - MINUTE));

      expect(await check(token('s-cached'), revokedNow, T0 + 1000, true)).toBe('revoked');
      expect(revokedNow).toHaveBeenCalledTimes(1);
    });

    it('a live token passes; an anonymous one is looked up too', async () => {
      const { check } = revocationCheck();
      const lookup = vi.fn(async () => live);

      expect(await check(token('s-live'), lookup, T0, true)).toBe('ok');
      expect(await check(token('s-anon', 'anonymous'), lookup, T0, true)).toBe('ok');
      expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('has its own budget: normal traffic draining its budget leaves strict checks working', async () => {
      const { check } = revocationCheck(limitsWith({ normal: { burst: 1, perSecond: 0 } }));
      await check(token('d1'), async () => live, T0);
      expect(await check(token('d2'), async () => live, T0)).toBe('unavailable');

      expect(await check(token('d2'), async () => live, T0, true)).toBe('ok');
    });

    it('is limited per account, so one account cannot drain the strict budget', async () => {
      const { check } = revocationCheck(
        limitsWith({ strictPerAccount: { burst: 2, perSecond: 0 } })
      );
      const lookup = vi.fn(async () => live);

      for (let i = 0; i < 2; i += 1)
        expect(await check(token('s-busy'), lookup, T0 + i, true)).toBe('ok');
      expect(await check(token('s-busy'), lookup, T0 + 2, true)).toBe('unavailable');
      expect(await check(token('s-other'), lookup, T0 + 3, true)).toBe('ok');
    });
  });
});
