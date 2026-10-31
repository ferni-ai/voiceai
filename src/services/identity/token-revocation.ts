/**
 * Whether a verified ID token's account still accepts it: the check firebase-admin's
 * verifyIdToken(token, true) makes (the account is gone or disabled, or its tokens were
 * revoked after this one was signed in), made so that it neither hammers Firebase Auth
 * nor fails open:
 *
 * - Each account is looked up at most once a minute (a bounded per-uid cache): the app
 *   polls /api/user-events/pending every 2 seconds.
 * - A lookup that fails (network, timeout, an Auth 5xx), or that the lookup budget below
 *   refuses, uses the account's last known state if it is under an hour old (logged as
 *   auth_revocation_stale). With nothing that recent the result is 'unavailable': the
 *   caller answers 503, try again. Never a 401 (the token may be fine), and never a pass
 *   (a revoked stolen token must not get through because Auth is down or its quota was
 *   run out on purpose). Active users stay cached, so in a long Auth outage only new
 *   sessions are asked to retry.
 * - Anonymous accounts are never looked up. They hold no grant worth revoking (no linked
 *   accounts, payments or verified identity), and free anonymous sign-ups are the cheap
 *   way to spend the Auth quota. A deleted anonymous account's token can still pass for
 *   up to its hour; writes for it are dropped by the data layer
 *   (engagement-write-unless-erased.ts, memory/storage/profile-write-unless-erased.ts).
 * - Uncached lookups share one token bucket (LOOKUP_BURST, then LOOKUP_PER_SECOND), so
 *   many accounts at once can't spend the project's Auth quota either.
 *
 * Strict mode, for approval, consent, payment and step-up checks: no cache read, no stale
 * state and no anonymous skip. The account is looked up now (still through the bucket),
 * and a lookup that can't run is 'unavailable' (503, fail closed).
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
}

/** The decoded token fields the check reads */
export interface CheckedToken {
  uid: string;
  auth_time: number;
  firebase?: { sign_in_provider?: string };
}

type AccountState = { gone: true } | { gone: false; disabled: boolean; validAfterMs: number };

const FRESH_MS = 60_000;
const STALE_MS = 60 * 60_000;
const MAX_ACCOUNTS = 10_000;
const LOOKUP_BURST = 200;
const LOOKUP_PER_SECOND = 50;
const LOG_EVERY_MS = 60_000;

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/** A once-a-minute log line carrying how many times it happened since the last one */
function countedLog(event: string, message: string) {
  let count = 0;
  let loggedAt = -Infinity;
  return (now: number, code: unknown) => {
    count += 1;
    if (now - loggedAt < LOG_EVERY_MS) return;
    log.warn({ event, count, code: String(code ?? 'none') }, message);
    loggedAt = now;
    count = 0;
  };
}

/** A check with its own cache and lookup budget (one per process; tests make their own) */
export function revocationCheck(burst = LOOKUP_BURST, perSecond = LOOKUP_PER_SECOND) {
  const accounts = new Map<string, { state: AccountState; at: number }>();
  let tokens = burst;
  let filledAt = 0;
  const stale = countedLog(
    'auth_revocation_stale',
    'auth_revocation_stale: using an account state up to an hour old'
  );
  const unavailable = countedLog(
    'auth_revocation_unavailable',
    'auth_revocation_unavailable: answering 503'
  );

  const takeLookup = (now: number): boolean => {
    tokens = Math.min(burst, tokens + ((now - filledAt) / 1000) * perSecond);
    filledAt = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  const remember = (uid: string, state: AccountState, now: number) => {
    accounts.delete(uid); // re-inserted last, so the oldest entry is first to go
    accounts.set(uid, { state, at: now });
    if (accounts.size > MAX_ACCOUNTS) accounts.delete(accounts.keys().next().value as string);
  };

  /** The account's state: fresh from the cache, looked up, or (when the lookup can't run) stale */
  const stateOf = async (
    uid: string,
    lookup: (uid: string) => Promise<AccountRecord>,
    now: number,
    strict: boolean
  ): Promise<{ state: AccountState; stale: boolean } | 'unavailable'> => {
    const cached = strict ? undefined : accounts.get(uid);
    if (cached && now - cached.at < FRESH_MS) return { state: cached.state, stale: false };
    let failure: unknown = 'lookup-budget';
    if (takeLookup(now)) {
      try {
        const account = await lookup(uid);
        const validAfter = account.tokensValidAfterTime
          ? Date.parse(account.tokensValidAfterTime)
          : 0;
        const state = {
          gone: false as const,
          disabled: account.disabled,
          validAfterMs: validAfter || 0,
        };
        remember(uid, state, now);
        return { state, stale: false };
      } catch (error) {
        if (codeOf(error) === 'auth/user-not-found') {
          remember(uid, { gone: true }, now);
          return { state: { gone: true }, stale: false };
        }
        failure = codeOf(error) ?? error;
      }
    }
    if (cached && now - cached.at < STALE_MS) {
      stale(now, failure);
      return { state: cached.state, stale: true };
    }
    unavailable(now, failure);
    return 'unavailable';
  };

  return async (
    token: CheckedToken,
    lookup: (uid: string) => Promise<AccountRecord>,
    now = Date.now(),
    strict = false
  ): Promise<Revocation> => {
    if (!strict && token.firebase?.sign_in_provider === 'anonymous') return 'anonymous';
    const known = await stateOf(token.uid, lookup, now, strict);
    if (known === 'unavailable') return 'unavailable';
    const { state } = known;
    if (state.gone) return 'gone';
    if (state.disabled) return 'disabled';
    if (token.auth_time * 1000 < state.validAfterMs) return 'revoked';
    return known.stale ? 'stale' : 'ok';
  };
}

const check = revocationCheck();

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
  const status = await check(decoded, lookup, Date.now(), options.strict === true);
  if (status === 'ok' || status === 'stale' || status === 'anonymous') return decoded;
  const code = status === 'unavailable' ? AUTH_CHECK_UNAVAILABLE : REFUSED[status];
  throw Object.assign(new Error(`Firebase token not accepted: ${status}`), { code });
}
