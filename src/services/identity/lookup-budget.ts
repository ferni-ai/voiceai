/**
 * The rate limits behind the account check on ID tokens (token-revocation.ts): a token
 * bucket, a global-plus-per-account budget built from two of them, and the bounded map
 * that holds per-account state, so a flood of new accounts can't grow memory without end.
 *
 * @module services/identity/lookup-budget
 */

const MAX_ACCOUNTS = 10_000;

/** A token bucket: `burst` at once, then `perSecond` */
export interface Rate {
  burst: number;
  perSecond: number;
}

/**
 * A map that drops its oldest entry past MAX_ACCOUNTS. Never for invalidations
 * (token-revocation.ts keeps those apart): evicting one would un-stick it.
 */
export function boundedMap<V>() {
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
export function budget(global: Rate, perAccount: Rate) {
  const all = bucket(global);
  const accounts = boundedMap<(now: number) => boolean>();
  return (uid: string, now: number): boolean => {
    let mine = accounts.get(uid);
    if (!mine) accounts.set(uid, (mine = bucket(perAccount)));
    return mine(now) && all(now);
  };
}
