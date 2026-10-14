/**
 * Accounts made by test harnesses: voice-eval callers, e2e runs and local
 * devices. They share production Firestore and look like real users, so
 * anything that reaches real people (outreach, calls, texts) must skip them.
 *
 * @module utils/synthetic-user
 */

const SYNTHETIC_USER_ID = /^(voice-eval-|e2e-|device:(test|local-dev|debug))/;

/** Whether this user id belongs to a test harness rather than a real person. */
export function isSyntheticUserId(userId: string | undefined | null): boolean {
  return typeof userId === 'string' && SYNTHETIC_USER_ID.test(userId);
}
