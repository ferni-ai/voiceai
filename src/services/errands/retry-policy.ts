/**
 * How the effects runner retries each kind of errand effect: backoff, a cap
 * on attempts, and which errors are worth another try. One table, so no
 * effect invents its own retry loop (errands design 2.1, "actually durable").
 *
 * These are runner-level retries of a failed effect. A call that reaches
 * voicemail did not fail; that retry is an errand step (step.ts), not this.
 *
 * @module services/errands/retry-policy
 */

import type { EffectKind } from './errand.js';

/** Errors a runner may report that are worth another try. Anything else fails the effect. */
export type RetryableError = 'rate_limited' | 'provider_unavailable' | 'timeout';

export interface RetryPolicy {
  readonly maxAttempts: number;
  /** Wait before the second attempt; each later wait multiplies by `factor`. */
  readonly backoffMs: number;
  readonly factor: number;
  readonly retryable: readonly RetryableError[];
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const TRANSIENT: readonly RetryableError[] = ['rate_limited', 'provider_unavailable'];
const owner: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 30 * SECOND,
  factor: 2,
  retryable: TRANSIENT,
};

export const RETRY_POLICY: Readonly<Record<EffectKind, RetryPolicy>> = {
  ask_owner: owner,
  notify_owner: owner,
  offer_text_instead: owner,
  lookup_line_type: {
    maxAttempts: 5,
    backoffMs: 10 * SECOND,
    factor: 2,
    retryable: [...TRANSIENT, 'timeout'],
  },
  // A dial is not idempotent. A timeout may mean the call went out, so it is
  // not retryable here: the runner checks the provider before anything else.
  call: { maxAttempts: 2, backoffMs: MINUTE, factor: 1, retryable: TRANSIENT },
  text: { maxAttempts: 3, backoffMs: 30 * SECOND, factor: 2, retryable: TRANSIENT },
  cancel_call: { maxAttempts: 3, backoffMs: MINUTE, factor: 2, retryable: TRANSIENT },
  release_hold: { maxAttempts: 3, backoffMs: MINUTE, factor: 2, retryable: TRANSIENT },
  calendar: {
    maxAttempts: 5,
    backoffMs: 30 * SECOND,
    factor: 2,
    retryable: [...TRANSIENT, 'timeout'],
  },
  reminder: {
    maxAttempts: 5,
    backoffMs: 30 * SECOND,
    factor: 2,
    retryable: [...TRANSIENT, 'timeout'],
  },
};

/** The wait before attempt `attempt` (2 = the first retry), or null when the policy is spent. */
export function retryDelayMs(policy: RetryPolicy, attempt: number): number | null {
  if (attempt < 2 || attempt > policy.maxAttempts) return null;
  return policy.backoffMs * policy.factor ** (attempt - 2);
}

export function isRetryable(policy: RetryPolicy, error: string): boolean {
  return (policy.retryable as readonly string[]).includes(error);
}
