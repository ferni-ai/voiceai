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
 * Production keeps no data for the harness owners in SYNTHETIC_OWNER_PREFIXES:
 * synthetic-write-guard.ts refuses their writes and
 * scripts/migrations/purge-synthetic-data.ts removes what is left. The 2026-10-18
 * audit found about 94% of bogle_users subcollection documents were theirs:
 *   voice-eval-*  scripts/voice-eval/run.sh (one new user per call)
 *   e2e-*         src/e2e/context-factory.ts, e2e/*, scripts/test-*-e2e.ts
 *   flow-test-*   src/tests/cross-persona-integration.test.ts
 *   test-*        test-user-* from the CLI, factories and seed scripts
 *   ctx-e2e-*     context-builder e2e runs
 *   device:cli-*  the ferni CLI's voice client (device_id cli-<ts>)
 * plus phone_mappings rows for +1555 numbers (there is no 555 area code).
 * anon: callers and real Firebase uids (28 alphanumerics, no hyphen) never match.
 *
 * @module utils/synthetic-user
 */

/** The production Firestore project, where synthetic owners must not be written. */
export const PROD_FIRESTORE_PROJECT = 'johnb-2025';

/**
 * Prod's database inside PROD_FIRESTORE_PROJECT. Other databases in the project
 * (ferni-dev) are not prod: harness users may write there.
 */
export const PROD_FIRESTORE_DATABASE = '(default)';

/** Whether a project + database pair is prod's data. The one place that decides. */
export function isProdFirestore(project: string, database: string): boolean {
  return project === PROD_FIRESTORE_PROJECT && database === PROD_FIRESTORE_DATABASE;
}

/** Harness owner id prefixes the write guard and the purge act on. An allowlist. */
export const SYNTHETIC_OWNER_PREFIXES = [
  'voice-eval-',
  'e2e-',
  'flow-test-',
  'test-',
  'ctx-e2e-',
  'device:cli-',
] as const;

export type SyntheticOwnerPrefix = (typeof SYNTHETIC_OWNER_PREFIXES)[number];

/** Phone numbers no person has: the +1 555 "area code" does not exist. */
export const SYNTHETIC_PHONE_PREFIX = '+1555';

/** The harness prefix an owner id starts with, or null for anyone real. */
export function syntheticOwnerPrefix(ownerId: unknown): SyntheticOwnerPrefix | null {
  if (typeof ownerId !== 'string') return null;
  return SYNTHETIC_OWNER_PREFIXES.find((p) => ownerId.startsWith(p)) ?? null;
}

export function isSyntheticPhone(phone: unknown): boolean {
  return typeof phone === 'string' && phone.startsWith(SYNTHETIC_PHONE_PREFIX);
}

const LOCAL_DEVICE_ID = /^device:(test|local-dev|debug)/;

/** Prefixes of ids minted per session that never name an account. */
export const NON_ACCOUNT_PREFIXES = ['anon:', 'onbehalf:'] as const;

/** Ids used when there is no id at all, one bucket shared by everyone (lower case). */
export const PLACEHOLDER_IDS: ReadonlySet<string> = new Set([
  'anonymous',
  'shared',
  'default',
  'unknown',
]);

/** Whether this user id belongs to a test harness rather than a real person. */
export function isSyntheticUserId(userId: string | undefined | null): boolean {
  if (typeof userId !== 'string') return false;
  return syntheticOwnerPrefix(userId) !== null || LOCAL_DEVICE_ID.test(userId);
}

/** The non-account prefix this id starts with, if any (as given: a page cursor relies on it). */
export function nonAccountPrefixOf(userId: string): string | undefined {
  return NON_ACCOUNT_PREFIXES.find((prefix) => userId.startsWith(prefix));
}

/**
 * Whether this id names no account: missing or blank, a placeholder, or an
 * anon:/onbehalf: session id. Case-insensitive and trimmed, so 'Anonymous' or
 * ' ANON:x' can't slip past. services/identity/member-identity.ts builds on it.
 */
export function namesNoAccount(userId: string | undefined | null): boolean {
  if (typeof userId !== 'string') return true;
  const id = userId.trim().toLowerCase();
  if (!id || PLACEHOLDER_IDS.has(id)) return true;
  return nonAccountPrefixOf(id) !== undefined;
}

/**
 * Whether this id can be one real person's own account: not a test harness,
 * not an anon: or onbehalf: session id, not a placeholder.
 */
export function isPersonAccountId(userId: string | undefined | null): boolean {
  return !namesNoAccount(userId) && !isSyntheticUserId((userId as string).trim());
}
