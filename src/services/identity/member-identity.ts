/**
 * Whether a user id names a member: someone whose data Ferni may store and
 * read back on a later call.
 *
 * An allowlist, not a blocklist. The old check, `userId !== 'anonymous'`, let
 * every other non-member id through, so scores, memories and outreach could be
 * written about a stranger or about the other person on a call Ferni places.
 * Use this one predicate for every "may we store / read / act" decision. The
 * markers live in utils/synthetic-user.ts (PLACEHOLDER_IDS,
 * NON_ACCOUNT_PREFIXES, namesNoAccount), the one place a prefix is defined.
 *
 * NOT members (false), matched trimmed and case-insensitively:
 * - missing, empty or whitespace
 * - the placeholders `anonymous`, `unknown`, `default`, `shared`: one bucket
 *   shared by everyone without an id
 * - `anon:<id>`: a caller nobody recognised, minted per session
 *   (anonymous-session-id.ts)
 * - `onbehalf:<callId>`: the THIRD PARTY on a call Ferni places for a member
 *   (outreach/on-behalf-dispatch.ts). The member is not on the line.
 *
 * Members (true):
 * - a Firebase account uid
 * - `auth:<provider>:<id>`: a caller identified through an auth provider
 *   (user-identification.ts)
 * - `phone:<e164>`: minted for EVERY first-time caller whose caller ID came
 *   through (identifyByPhone). Caller ID can be spoofed, so storing under it is
 *   fine but contacting them is not: sending still needs a verified phone
 *   (outreach/guarded-text.ts), and unverified-user-id.ts treats it as unverified.
 * - `device:<id>`: a member before sign-in. Memory is kept under the device id
 *   and moved to the account on sign-in (identity/user-migration.ts).
 * - `family_<sponsoredIdentityId>`: a family member a sponsor set up
 *   (sponsored-identity.ts familyUserId, voice-agent-entry/metadata-parser.ts)
 * - `voice-eval-<id>`, `e2e-<id>`: test harness accounts. For storage they are
 *   members (evals check memory). Anything that reaches a real person must ALSO
 *   skip them: isSyntheticUserId / isPersonAccountId (utils/synthetic-user.ts).
 *
 * Stricter questions have their own predicates on top of this one: whether an
 * id is verified (unverified-user-id.ts), whether it is a person's own account
 * (isPersonAccountId), or whether the caller is the account's proven owner.
 *
 * @module services/identity/member-identity
 */
import { namesNoAccount } from '../../utils/synthetic-user.js';

/** True only for a real member's id; see the module doc for every prefix. */
export function isMemberIdentity(id: string | undefined | null): id is string {
  return !namesNoAccount(id);
}
