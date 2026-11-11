/**
 * The account check on an ID token (#3208 reviews): cached, invalidated on revoke and
 * delete, stale only while Auth itself fails, budgeted (and a refused budget is a 503,
 * never a pass), and anonymous sign-ins skipped only while the account is still
 * anonymous.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log, getLogger: () => log }));

import {
  revocationCheck,
  tokenCheckStatus,
  verifyIdTokenChecked,
  type AccountRecord,
  type Limits,
} from '../token-revocation.js';

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

describe('invalidations (#3228)', () => {
  const signedInAt = (uid: string, ms: number) => ({ ...token(uid), auth_time: ms / 1000 });
  const stillThere = vi.fn(async () => live); // during an erasure the Firebase user still exists

  it("'gone' is never downgraded: a revoke after it, then a new sign-in, is still refused", async () => {
    const { check, invalidate } = revocationCheck();
    invalidate('u-erased', 'gone', T0);
    invalidate('u-erased', 'revoked', T0 + MINUTE); // a revoke that finished after the erasure began
    const newSignIn = signedInAt('u-erased', T0 + 2 * MINUTE);

    expect(await check(newSignIn, stillThere, T0 + 3 * MINUTE)).toBe('gone');
    expect(await check(newSignIn, stillThere, T0 + 3 * MINUTE, true)).toBe('gone');
  });

  it("'gone' refuses a token signed in after the invalidation, normal and strict", async () => {
    const { check, invalidate } = revocationCheck();
    invalidate('u-deleted', 'gone', T0);
    const after = signedInAt('u-deleted', T0 + 5 * MINUTE);

    expect(await check(after, stillThere, T0 + 6 * MINUTE)).toBe('gone');
    expect(await check(after, stillThere, T0 + 6 * MINUTE, true)).toBe('gone');
    expect(stillThere).not.toHaveBeenCalled();
  });

  it('10,001 cache entries after an invalidation do not un-stick it', async () => {
    const { check, invalidate } = revocationCheck();
    invalidate('u-gone', 'gone', T0);
    invalidate('u-revoked', 'revoked', T0);
    for (let i = 0; i <= 10_000; i++) await check(token(`u-${i}`), stillThere, T0 + 1);

    expect(await check(signedInAt('u-gone', T0 + 1), stillThere, T0 + 2)).toBe('gone');
    expect(await check(token('u-revoked'), stillThere, T0 + 2)).toBe('revoked');
  });

  it('10,001 later invalidations of other accounts do not evict one', async () => {
    const { check, invalidate } = revocationCheck();
    invalidate('u-gone', 'gone', T0);
    invalidate('u-revoked', 'revoked', T0);
    for (let i = 0; i <= 10_000; i++) {
      invalidate(`g-${i}`, 'gone', T0 + 1);
      invalidate(`r-${i}`, 'revoked', T0 + 1);
    }

    expect(await check(signedInAt('u-gone', T0 + 2), stillThere, T0 + 3)).toBe('gone');
    expect(await check(token('u-revoked'), stillThere, T0 + 3)).toBe('revoked');
  });

  it("a revoke is let go only once Firebase's own record refuses the same tokens", async () => {
    const { check, invalidate } = revocationCheck();
    invalidate('u-rev', 'revoked', T0);
    const before = token('u-rev'); // signed in before the revoke
    const keep = 61 * MINUTE; // STALE_MS + FRESH_MS
    invalidate('u-other', 'revoked', T0 + keep); // prunes what has aged out

    expect(await check(before, async () => revokedSince(T0), T0 + keep + 1)).toBe('revoked');
    // Kept until then, even with no Firebase record of the revoke
    const { check: check2, invalidate: invalidate2 } = revocationCheck();
    invalidate2('u-rev', 'revoked', T0);
    invalidate2('u-other', 'revoked', T0 + keep - 1);
    expect(await check2(before, stillThere, T0 + keep - 1)).toBe('revoked');
  });
});

describe('concurrent checks of one account share one lookup', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  const settle = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  /** The web app's load: 8 authed calls at once, through the real check and its real limits */
  const burst = (uid: string, getUser: (uid: string) => Promise<AccountRecord>) => {
    const auth = {
      verifyIdToken: async () => ({ ...token(uid), auth_time: Date.now() / 1000 - 600 }),
      getUser: vi.fn(getUser),
    };
    const statuses = Array.from({ length: 8 }, () =>
      verifyIdTokenChecked(auth, 'id-token').then(
        () => 200,
        (error: { code?: string }) => (tokenCheckStatus(error, 401) === 503 ? 503 : error.code)
      )
    );
    return { auth, statuses: Promise.all(statuses) };
  };

  it('8 calls at once on a cold cache: one lookup, no 503', async () => {
    const account = deferred<AccountRecord>();
    const { auth, statuses } = burst('u_test-load', () => account.promise);
    await settle(); // every call is waiting on the account before it answers
    account.resolve(live);

    expect(await statuses).toEqual(Array(8).fill(200));
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('a revoked token is refused by every call in the burst', async () => {
    const account = deferred<AccountRecord>();
    const { auth, statuses } = burst('u_test-revoked', () => account.promise);
    await settle();
    account.resolve(revokedSince(Date.now() - MINUTE));

    expect(await statuses).toEqual(Array(8).fill('auth/id-token-revoked'));
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('Auth failing: every call is a 503, and the next call looks the account up again', async () => {
    const account = deferred<AccountRecord>();
    const { auth, statuses } = burst('u_test-down', () => account.promise);
    await settle();
    account.reject(Object.assign(new Error('down'), { code: 'auth/internal-error' }));
    expect(await statuses).toEqual(Array(8).fill(503));

    const after = burst('u_test-down', async () => live);
    expect(await after.statuses).toEqual(Array(8).fill(200)); // the failed lookup was let go
    expect(auth.getUser.mock.calls.length + after.auth.getUser.mock.calls.length).toBe(2);
  });

  it('a revoked token stays refused on later calls, and a lookup past the cache minute sees a new revoke', async () => {
    const { check } = revocationCheck();
    const lookup = vi.fn(async () => live);
    await Promise.all([1, 2, 3].map(() => check(token('u-seq'), lookup, T0)));

    const revokedNow = vi.fn(async () => revokedSince(T0 + MINUTE));
    expect(await check(token('u-seq'), revokedNow, T0 + 2 * MINUTE)).toBe('revoked');
    expect(await check(token('u-seq'), revokedNow, T0 + 2 * MINUTE + 1)).toBe('revoked');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(revokedNow).toHaveBeenCalledTimes(1);
  });

  it('a strict check never waits on a lax lookup: it looks the account up now', async () => {
    const { check } = revocationCheck();
    const account = deferred<AccountRecord>();
    const lax = check(token('u-mixed'), () => account.promise, T0);
    const revokedNow = vi.fn(async () => revokedSince(T0 - MINUTE));

    expect(await check(token('u-mixed'), revokedNow, T0 + 1, true)).toBe('revoked');
    expect(revokedNow).toHaveBeenCalledTimes(1);
    account.resolve(live);
    expect(await lax).toBe('ok');
  });

  it('a lookup older than JOIN_MS (hung) is not waited on: the check starts its own', async () => {
    const { check } = revocationCheck();
    void check(token('u-hung'), () => new Promise<AccountRecord>(() => {}), T0);

    expect(await check(token('u-hung'), async () => live, T0 + 10_001)).toBe('ok');
  });

  it('a joined result is cached from the lookup start, not the join: a mid-lookup revoke is seen at start + the cache minute', async () => {
    const { check } = revocationCheck();
    const account = deferred<AccountRecord>();
    const first = check(token('u_test-join'), () => account.promise, T0); // lookup starts at T0
    // The revoke lands at T0 + 1 s, after Auth read the account; a joiner arrives just
    // inside JOIN_MS and gets the pre-revoke read
    const joiner = check(token('u_test-join'), vi.fn(), T0 + 10_000 - 1);
    account.resolve(live);
    expect(await Promise.all([first, joiner])).toEqual(['ok', 'ok']);

    const revokedNow = vi.fn(async () => revokedSince(T0 + 1000));
    expect(await check(token('u_test-join'), revokedNow, T0 + MINUTE - 1)).toBe('ok'); // cache, as on main
    expect(revokedNow).not.toHaveBeenCalled();
    expect(await check(token('u_test-join'), revokedNow, T0 + MINUTE)).toBe('revoked'); // not later
    expect(revokedNow).toHaveBeenCalledTimes(1);
  });

  it('distinct accounts beyond the budget are refused as before', async () => {
    const { check } = revocationCheck(limitsWith({ normal: { burst: 3, perSecond: 0 } }));
    const uids = ['d-1', 'd-2', 'd-3', 'd-4', 'd-5'];

    expect(await Promise.all(uids.map((uid) => check(token(uid), async () => live, T0)))).toEqual([
      'ok',
      'ok',
      'ok',
      'unavailable',
      'unavailable',
    ]);
  });

  const JOIN_MS = 10_000; // token-revocation.ts JOIN_MS

  it('an older lookup failing does not drop a newer one: a later check still joins the newer lookup', async () => {
    const { check } = revocationCheck(limitsWith({}));
    const uid = 'u_test-replaced';
    const older = deferred<AccountRecord>();
    const newer = deferred<AccountRecord>();
    const third = vi.fn(async () => live);

    const first = check(token(uid), () => older.promise, T0);
    // Past JOIN_MS the first lookup may be hung: this check starts its own, which takes
    // over the in-flight entry
    const second = check(token(uid), () => newer.promise, T0 + JOIN_MS + 1);
    older.reject(Object.assign(new Error('down'), { code: 'auth/internal-error' }));
    expect(await first).toBe('unavailable');

    // The first lookup settling must leave the second one's entry in place
    const joiner = check(token(uid), third, T0 + JOIN_MS + 2);
    newer.resolve(live);
    expect(await Promise.all([second, joiner])).toEqual(['ok', 'ok']);
    expect(third).not.toHaveBeenCalled(); // 2 upstream lookups in all, not 3
  });

  it('a lax check never joins a strict lookup: it looks the account up itself', async () => {
    const { check } = revocationCheck(limitsWith({}));
    const uid = 'u_test-strict-first';
    const account = deferred<AccountRecord>();
    const strictLookup = vi.fn(() => account.promise);
    const laxLookup = vi.fn(async () => live);

    const strict = check(token(uid), strictLookup, T0, true);
    const lax = check(token(uid), laxLookup, T0 + 1);
    account.resolve(live);

    expect(await Promise.all([strict, lax])).toEqual(['ok', 'ok']);
    expect(strictLookup).toHaveBeenCalledTimes(1);
    expect(laxLookup).toHaveBeenCalledTimes(1); // its own lookup: 2 upstream calls in all
  });

  it('JOIN_MS boundary: a lookup is joined at start + JOIN_MS - 1 and not at exactly start + JOIN_MS', async () => {
    const { check } = revocationCheck(limitsWith({}));
    const uid = 'u_test-join-edge';
    const account = deferred<AccountRecord>();
    const justInside = vi.fn(async () => live);
    const atLimit = vi.fn(async () => live);

    const statuses = [
      check(token(uid), () => account.promise, T0),
      check(token(uid), justInside, T0 + JOIN_MS - 1),
      check(token(uid), atLimit, T0 + JOIN_MS),
    ];
    account.resolve(live);

    expect(await Promise.all(statuses)).toEqual(['ok', 'ok', 'ok']);
    expect(justInside).not.toHaveBeenCalled(); // joined the lookup started at T0
    expect(atLimit).toHaveBeenCalledTimes(1); // too old to join: its own lookup
  });
});
