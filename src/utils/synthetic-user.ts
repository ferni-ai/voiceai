/**
 * Ids that are not one real person's own account.
 *
 * Test harnesses (voice-eval callers, e2e runs, local devices) share production
 * Firestore and look like real users, so anything that reaches real people
 * (outreach, calls, texts) must skip them: isSyntheticUserId.
 *
 * Jobs that sweep accounts (daily outreach, scheduled calls) must also skip
 * ids that name no account at all: the per-session anon: id of a caller nobody
 * recognised (eval runs over SIP land here too), the onbehalf: id of a call
 * placed for someone, and the placeholders used when there is no id. Those
 * docs pile up one per session, and no one can ever open a note sent to them:
 * isPersonAccountId.
 *
 * @module utils/synthetic-user
 */

const SYNTHETIC_USER_ID = /^(voice-eval-|e2e-|device:(test|local-dev|debug))/;

/** Prefixes of ids minted per session that never name an account. */
export const NON_ACCOUNT_PREFIXES = ['anon:', 'onbehalf:'] as const;

const PLACEHOLDER_IDS = new Set(['anonymous', 'shared', 'default', 'unknown']);

/** Whether this user id belongs to a test harness rather than a real person. */
export function isSyntheticUserId(userId: string | undefined | null): boolean {
  return typeof userId === 'string' && SYNTHETIC_USER_ID.test(userId);
}

/** The non-account prefix this id starts with, if any (as given: a page cursor relies on it). */
export function nonAccountPrefixOf(userId: string): string | undefined {
  return NON_ACCOUNT_PREFIXES.find((prefix) => userId.startsWith(prefix));
}

/**
 * Whether this id can be one real person's own account: not a test harness,
 * not an anon: or onbehalf: session id, not a placeholder.
 */
export function isPersonAccountId(userId: string | undefined | null): boolean {
  if (typeof userId !== 'string') return false;
  const id = userId.trim();
  if (!id || PLACEHOLDER_IDS.has(id) || isSyntheticUserId(id)) return false;
  return nonAccountPrefixOf(id) === undefined;
}
