/**
 * ONBEHALF_WRITE_GATE: nothing about an on-behalf call is stored under its
 * throwaway id, and the call is offered no tool that acts on an account.
 *
 * A call Ferni places for a member runs as `onbehalf:<callId>`
 * (outreach/on-behalf-dispatch.ts, then identifyFromMetadata's last-resort
 * session id). Fast capture, the short-term buffer and knowledge capture
 * already skipped that id (memory/third-party-call.ts), and memory recall, the
 * timeline and profile writes skip every non-member. The session summary,
 * relationship arc, seeds, presence and persona affinity, the conversation-end
 * event, the plan and user model, the per-turn learners and the thread recorder
 * kept writing under it: documents no one reads back, about a person who never
 * agreed to be remembered. Own-account tools (rememberAboutUser, addContact)
 * stayed offered too. What the call is for still lands under the REQUESTER
 * (captureCallResult), which this gate does not touch.
 *
 * The predicate is the one the memory guards use, isThirdPartyCallUser. An
 * anon: caller is not a member either, but keeps its tools and writes here: a
 * different question, with different callers. Kill switch, default on.
 *
 * @module services/identity/owner-write-gate
 */
import { flagOn } from '../../config/env-flag.js';
import { isThirdPartyCallUser } from '../../memory/third-party-call.js';

type Env = Record<string, string | undefined>;

/** True for an on-behalf call's id while the gate is on: nothing is stored under it. */
export function ownerWritesBlocked(
  userId: string | undefined | null,
  env: Env = process.env
): boolean {
  return isThirdPartyCallUser(userId) && flagOn('ONBEHALF_WRITE_GATE', env);
}

/** The id owner data is written under: the session's own, or undefined on an on-behalf call. */
export function ownerWriteId<T extends string | undefined | null>(
  userId: T,
  env: Env = process.env
): T | undefined {
  return ownerWritesBlocked(userId, env) ? undefined : userId;
}
