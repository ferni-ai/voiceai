/**
 * Whether a user id names a member: someone whose data Ferni may store, read
 * back or act on, and whom Ferni may contact.
 *
 * An allowlist, not a blocklist. The old check, `userId !== 'anonymous'`, let
 * every other non-member id through, so scores, memories and outreach could be
 * written about a stranger or about the other person on a call Ferni places.
 * Use this one predicate for every "may we store / act / send" decision.
 *
 * NOT members (false):
 * - missing, empty or whitespace
 * - the placeholders `anonymous`, `unknown`, `default`, `shared` (any case):
 *   one bucket shared by everyone without an id
 * - `anon:<id>`: a caller nobody recognised, minted per session
 *   (anonymous-session-id.ts)
 * - `onbehalf:<callId>`: the THIRD PARTY on a call Ferni places for a member
 *   (outreach/on-behalf-dispatch.ts). The member is not on the line.
 *
 * Members (true):
 * - a Firebase account uid
 * - `phone:<e164>`: a caller recognised by number, who has a profile
 *   (user-identification.ts identifyByPhone)
 * - `device:<id>`: a member before sign-in. Memory is kept under the device id
 *   and moved to the account on sign-in (identity/user-migration.ts).
 * - `sponsored_<id>`: a family member a sponsor set up (sponsored-identity.ts)
 * - `voice-eval-<id>`, `e2e-<id>`: test harness accounts. Evals check that
 *   memory works, so they keep member storage. Anything that reaches a real
 *   person must ALSO skip them with isSyntheticUserId (utils/synthetic-user.ts).
 *
 * Stricter questions have their own predicates on top of this one: whether an
 * id is verified (unverified-user-id.ts), whether it is a Firebase uid, or
 * whether the caller is the account's proven owner.
 *
 * src/tests/member-identity-callers.test.ts fails on a new literal
 * `'anonymous'` comparison or `startsWith('anon:' | 'onbehalf:')` in src.
 *
 * @module services/identity/member-identity
 */

const PLACEHOLDER_IDS: ReadonlySet<string> = new Set(['anonymous', 'unknown', 'default', 'shared']);

const NON_MEMBER_PREFIXES = ['anon:', 'onbehalf:'] as const;

/** True only for a real member's id; see the module doc for every prefix. */
export function isMemberIdentity(id: string | undefined | null): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim().toLowerCase();
  if (trimmed === '' || PLACEHOLDER_IDS.has(trimmed)) return false;
  return !NON_MEMBER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
