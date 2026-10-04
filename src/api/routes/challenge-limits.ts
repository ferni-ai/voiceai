/**
 * Rate limit for creating challenges (Musical You and Social), keyed by the
 * verified caller rather than the IP, on top of each service's cap on open
 * challenges per challenger. Per instance, like every rateLimit window.
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
