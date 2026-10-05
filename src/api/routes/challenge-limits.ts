/**
 * Rate limits keyed by the verified caller rather than the IP, per instance
 * like every rateLimit window: creating challenges (Musical You and Social, on
 * top of each service's cap on open challenges), and recording game results
 * (scores are client-reported, so this bounds how fast one user can climb).
 *
 * @module api/routes/challenge-limits
 */
export const CHALLENGE_CREATES_PER_MINUTE = 20;

/** rateLimit options for `userId` creating challenges under `prefix`. */
export function challengeCreateLimit(prefix: string, userId: string) {
  return {
    maxRequests: CHALLENGE_CREATES_PER_MINUTE,
    windowMs: 60_000,
    keyPrefix: `${prefix}-challenge-create`,
    keyGenerator: () => `user:${userId}`,
  };
}

export const RESULTS_PER_MINUTE = 30;

/** rateLimit options for `userId` recording game results under `prefix`. */
export function resultRecordLimit(prefix: string, userId: string) {
  return {
    maxRequests: RESULTS_PER_MINUTE,
    windowMs: 60_000,
    keyPrefix: `${prefix}-result-record`,
    keyGenerator: () => `user:${userId}`,
  };
}
