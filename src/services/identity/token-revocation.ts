/**
 * Whether a verified ID token's account still accepts it: the check firebase-admin's
 * verifyIdToken(token, true) makes (the account is gone or disabled, or its tokens were
 * revoked after this one was signed in), made so that it neither hammers Firebase Auth
 * nor fails open.
 *
 * - Cache: each account is looked up at most once a minute (bounded, per uid); the app
 *   polls /api/user-events/pending every 2 seconds. Deleting, revoking or erasing an
 *   account here invalidates its entry at once (invalidateAccount); another server
 *   instance learns within the minute.
 * - Stale state: only when Auth itself fails (a transport error, a timeout, a 5xx) is an
 *   account state under an hour old used (logged auth_revocation_stale). With none, or
 *   for any other failure, the answer is 'unavailable': a 503, try again. Never a 401,
 *   and never a pass, so a revoked stolen token can't get through because Auth is down.
 * - Budgets: lookups are rate-limited globally and per account, and a refused lookup is
 *   always 'unavailable', never a stale pass, so a drained budget can't be used to get
 *   a revoked token through. Normal, strict and anonymous-sign-in tokens have separate
 *   budgets (LIMITS), so one kind of traffic can't drain another's.
 * - Anonymous sign-ins: a token with the 'anonymous' provider skips the lookup only when
 *   a cached record (under an hour old) shows the account still has no linked provider.
 *   An account upgraded to a real login keeps such tokens, so it is looked up like any
 *   other (on the anonymous budget).
 * - Strict mode, for approval, consent, payment, erasure, key-minting and step-up checks:
 *   no cache read, no stale state and no anonymous skip. The account is looked up now
 *   (on the strict budget, or the anonymous one for an anonymous sign-in), and a lookup
 *   that can't run is 'unavailable'.
 *
 * Deliberate windows, covered by the data-layer guards (engagement-write-unless-erased.ts,
 * memory/storage/profile-write-unless-erased.ts): up to a minute of cache on another
 * instance, and an hour of stale state while Auth is failing.
 *
 * @module services/identity/token-revocation
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'token-revocation' });

/** 'ok', 'stale' and 'anonymous' accept the token; 'unavailable' is a 503; the rest a 401 */
export type Revocation =
  'ok' | 'stale' | 'anonymous' | 'unavailable' | 'gone' | 'disabled' | 'revoked';

/** The part of a Firebase Auth user record the check reads */
export interface AccountRecord {
  disabled: boolean;
  tokensValidAfterTime?: string;
  providerData?: readonly unknown[];
}

/** The decoded token fields the check reads */
export interface CheckedToken {
  uid: string;
  auth_time: number;
  firebase?: { sign_in_provider?: string };
}

type AccountState =
  { gone: true } | { gone: false; disabled: boolean; validAfterMs: number; noProvider: boolean };

/** A token bucket: `burst` at once, then `perSecond` */
interface Rate {
  burst: number;
  perSecond: number;
}
export interface Limits {
  normal: Rate;
  normalPerAccount: Rate;
  strict: Rate;
  strictPerAccount: Rate;
  anonymous: Rate;
  anonymousPerAccount: Rate;
}
const LIMITS: Limits = {
  normal: { burst: 200, perSecond: 50 },
  normalPerAccount: { burst: 3, perSecond: 1 / 10 },
  strict: { burst: 100, perSecond: 20 },
  strictPerAccount: { burst: 20, perSecond: 1 / 3 }, // an account page makes several
  anonymous: { burst: 50, perSecond: 10 },
  anonymousPerAccount: { burst: 5, perSecond: 1 / 20 },
};

const FRESH_MS = 60_000;
const STALE_MS = 60 * 60_000;
const MAX_ACCOUNTS = 10_000;
const LOG_EVERY_MS = 60_000;
const AUTH_FAILURES = [
  'app/network-error',
  'app/network-timeout',
  'auth/internal-error',
  'app/internal-error',
];

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/** Auth itself failing (transport, timeout, 5xx), as opposed to refusing, a quota or a bug */
function authFailed(error: unknown): boolean {
  const code = codeOf(error);
  if (typeof code !== 'string') return false;
  return (
    AUTH_FAILURES.includes(code) || /^E(CONNRESET|CONNREFUSED|TIMEDOUT|AI_AGAIN|PIPE)$/.test(code)
  );
}

/** A once-a-minute log line carrying how many times it happened since the last one */
function countedLog(event: string, message: string) {
  let count = 0;
  let loggedAt = -Infinity;
  return (now: number, cause: unknown) => {
    count += 1;
    if (now - loggedAt < LOG_EVERY_MS) return;
    log.warn({ event, count, cause: String(cause ?? 'none') }, message);
    loggedAt = now;
    count = 0;
  };
}

/** A map that drops its oldest entry past MAX_ACCOUNTS */
function boundedMap<V>() {
  const map = new Map<string, V>();
  return {
    get: (key: string) => map.get(key),
    set: (key: string, value: V) => {
      map.delete(key); // re-inserted last, so the oldest entry is first to go
      map.set(key, value);
      if (map.size > MAX_ACCOUNTS) map.delete(map.keys().next().value as string);
    },
  };
}

/** take(now): one token from a bucket of `rate`, or false when it is empty */
function bucket(rate: Rate) {
  let tokens = rate.burst;
  let filledAt = Infinity;
  return (now: number): boolean => {
    tokens = Math.min(rate.burst, tokens + (Math.max(0, now - filledAt) / 1000) * rate.perSecond);
    filledAt = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

/** A global bucket plus one per account: both must have a token */
function budget(global: Rate, perAccount: Rate) {
  const all = bucket(global);
  const accounts = boundedMap<(now: number) => boolean>();
  return (uid: string, now: number): boolean => {
    let mine = accounts.get(uid);
    if (!mine) accounts.set(uid, (mine = bucket(perAccount)));
    return mine(now) && all(now);
  };
}

/** A check with its own cache and budgets (one per process; tests make their own) */
export function revocationCheck(limits: Limits = LIMITS) {
  const accounts = boundedMap<{ state: AccountState; at: number }>();
  const budgets = {
    normal: budget(limits.normal, limits.normalPerAccount),
    strict: budget(limits.strict, limits.strictPerAccount),
    anonymous: budget(limits.anonymous, limits.anonymousPerAccount),
  };
  const stale = countedLog(
    'auth_revocation_stale',
    'auth_revocation_stale: Auth failing; using an account state up to an hour old'
  );
  const unavailable = countedLog(
    'auth_revocation_unavailable',
    'auth_revocation_unavailable: answering 503'
  );

  const lookUp = async (
    uid: string,
    lookup: (uid: string) => Promise<AccountRecord>,
    now: number
  ): Promise<AccountState | { failed: unknown }> => {
    try {
      const account = await lookup(uid);
      const validAfter = account.tokensValidAfterTime
        ? Date.parse(account.tokensValidAfterTime)
        : 0;
      const state: AccountState = {
        gone: false,
        disabled: account.disabled,
        validAfterMs: validAfter || 0,
        noProvider: (account.providerData ?? []).length === 0,
      };
      accounts.set(uid, { state, at: now });
      return state;
    } catch (error) {
      if (codeOf(error) !== 'auth/user-not-found') return { failed: error };
      accounts.set(uid, { state: { gone: true }, at: now });
      return { gone: true };
    }
  };

  /** The account's state (stale, or skipped for an anonymous one); 'unavailable' when unknown */
  const stateOf = async (
    token: CheckedToken,
    lookup: (uid: string) => Promise<AccountRecord>,
    now: number,
    strict: boolean
  ): Promise<{ state: AccountState; stale: boolean; skipped: boolean } | 'unavailable'> => {
    const anonymousSignIn = token.firebase?.sign_in_provider === 'anonymous';
    const cached = strict ? undefined : accounts.get(token.uid);
    const age = cached ? now - cached.at : Infinity;
    if (cached && age < FRESH_MS) return { state: cached.state, stale: false, skipped: false };
    const stillAnonymous = cached && !cached.state.gone && cached.state.noProvider;
    if (cached && anonymousSignIn && stillAnonymous && age < STALE_MS) {
      return { state: cached.state, stale: false, skipped: true };
    }
    const kind = anonymousSignIn ? 'anonymous' : strict ? 'strict' : 'normal';
    if (!budgets[kind](token.uid, now)) {
      unavailable(now, `${kind}-budget`);
      return 'unavailable'; // a refused lookup is never a stale pass
    }
    const found = await lookUp(token.uid, lookup, now);
    if (!('failed' in found)) return { state: found, stale: false, skipped: false };
    if (cached && age < STALE_MS && authFailed(found.failed)) {
      stale(now, codeOf(found.failed));
      return { state: cached.state, stale: true, skipped: false };
    }
    unavailable(now, codeOf(found.failed) ?? 'error');
    return 'unavailable';
  };

  const check = async (
    token: CheckedToken,
    lookup: (uid: string) => Promise<AccountRecord>,
    now = Date.now(),
    strict = false
  ): Promise<Revocation> => {
    const known = await stateOf(token, lookup, now, strict);
    if (known === 'unavailable') return 'unavailable';
    const { state } = known;
    if (state.gone) return 'gone';
    if (state.disabled) return 'disabled';
    if (token.auth_time * 1000 < state.validAfterMs) return 'revoked';
    if (known.skipped) return 'anonymous';
    return known.stale ? 'stale' : 'ok';
  };

  /** The account was deleted or erased ('gone'), or its tokens revoked, just now */
  const invalidate = (uid: string, change: 'gone' | 'revoked', now = Date.now()) => {
    const state: AccountState =
      change === 'gone'
        ? { gone: true }
        : { gone: false, disabled: false, validAfterMs: now, noProvider: false };
    accounts.set(uid, { state, at: now });
  };

  return { check, invalidate };
}

const revocation = revocationCheck();

/**
 * Call when an account is deleted or erased ('gone') or its tokens revoked ('revoked'):
 * this process refuses its tokens at once instead of after the cache minute.
 */
export function invalidateAccount(uid: string, change: 'gone' | 'revoked'): void {
  revocation.invalidate(uid, change);
}

const REFUSED: Record<'gone' | 'disabled' | 'revoked', string> = {
  gone: 'auth/user-not-found',
  disabled: 'auth/user-disabled',
  revoked: 'auth/id-token-revoked',
};

/** The code a token rejects with when its account couldn't be checked: answer 503, not 401 */
export const AUTH_CHECK_UNAVAILABLE = 'auth/revocation-check-unavailable';

/** True for the rejection that means "try again" (503), not "bad token" (401) */
export function isAuthCheckUnavailable(error: unknown): boolean {
  return codeOf(error) === AUTH_CHECK_UNAVAILABLE;
}

/** The status for a token check that threw: 503 (try again) when its account couldn't be checked */
export function tokenCheckStatus(error: unknown, otherwise: number): number {
  return isAuthCheckUnavailable(error) ? 503 : otherwise;
}

/** The part of a firebase-admin Auth instance verifyIdTokenChecked uses */
export interface TokenVerifier<T extends CheckedToken> {
  verifyIdToken: (idToken: string) => Promise<T>;
  getUser: (uid: string) => Promise<AccountRecord>;
}

/** `strict`: the account is looked up now, with no cache, stale state or anonymous skip */
export interface TokenCheckOptions {
  strict?: boolean;
}

/**
 * auth.verifyIdToken(idToken), then the account check above. Every ID token check uses
 * this instead of verifyIdToken(idToken, true). A refused token rejects with the code
 * verifyIdToken(idToken, true) would give (auth/user-not-found, auth/user-disabled,
 * auth/id-token-revoked); one that couldn't be checked with AUTH_CHECK_UNAVAILABLE.
 */
export async function verifyIdTokenChecked<T extends CheckedToken>(
  auth: TokenVerifier<T>,
  idToken: string,
  options: TokenCheckOptions = {}
): Promise<T> {
  const decoded = await auth.verifyIdToken(idToken);
  const lookup = (uid: string) => auth.getUser(uid);
  const status = await revocation.check(decoded, lookup, Date.now(), options.strict === true);
  if (status === 'ok' || status === 'stale' || status === 'anonymous') return decoded;
  const code = status === 'unavailable' ? AUTH_CHECK_UNAVAILABLE : REFUSED[status];
  throw Object.assign(new Error(`Firebase token not accepted: ${status}`), { code });
}
