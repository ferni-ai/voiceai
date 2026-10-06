import { FailureTracker } from './lightweight-resilience.js';

/**
 * Circuit breaker, rate limit and mutex for one call. Kept per session: one
 * worker runs several calls at once, and one caller's in-flight reply or
 * failures must not pause another's.
 */
export interface ReplyGuard {
  failureTracker: FailureTracker;
  lastCallTime: number;
  inProgress: boolean;
  currentContext: string | null;
}

const replyGuards = new WeakMap<object, ReplyGuard>();

export function guardFor(session: object): ReplyGuard {
  let guard = replyGuards.get(session);
  if (!guard) {
    guard = {
      failureTracker: new FailureTracker({ windowMs: 60_000, threshold: 3 }),
      lastCallTime: 0,
      inProgress: false,
      currentContext: null,
    };
    replyGuards.set(session, guard);
  }
  return guard;
}
