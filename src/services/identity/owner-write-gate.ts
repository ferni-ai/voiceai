/**
 * ONBEHALF_WRITE_GATE: nothing about an on-behalf call is stored under its
 * throwaway id, and the call is offered no tool that acts on an account.
 *
 * A call Ferni places for a member runs as `onbehalf:<callId>`
 * (outreach/on-behalf-dispatch.ts, then identifyFromMetadata's last-resort
 * session id). Fast capture, the short-term buffer and knowledge capture
 * already skipped that id (memory/third-party-call.ts), memory recall and the
 * timeline skip every non-member, and no profile is ever stored for it, gate or
 * not (every MemoryStore.saveProfile asks notStored first). The session summary,
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
 * An anonymous try-first visitor's throwaway id (`device:demo_…`,
 * isAnonymousDemoUser) is blocked the same way, always, with no kill switch:
 * they were told nothing is kept, and there is no account to act on.
 *
 * @module services/identity/owner-write-gate
 */
import { flagOn } from '../../config/env-flag.js';
import { isThirdPartyCallUser } from '../../memory/third-party-call.js';
import { isAnonymousDemoUser } from '../../utils/synthetic-user.js';

type Env = Record<string, string | undefined>;

/** True for a try-first visitor's id, and an on-behalf call's while the gate is on: nothing is stored under it. */
export function ownerWritesBlocked(
  userId: string | undefined | null,
  env: Env = process.env
): boolean {
  if (isAnonymousDemoUser(userId)) return true;
  return isThirdPartyCallUser(userId) && flagOn('ONBEHALF_WRITE_GATE', env);
}

/** The id owner data is written under: the session's own, or undefined on an on-behalf call. */
export function ownerWriteId<T extends string | undefined | null>(
  userId: T,
  env: Env = process.env
): T | undefined {
  return ownerWritesBlocked(userId, env) ? undefined : userId;
}

/** No log line prints their words: a try-first visitor's, or whoever answers a call Ferni placed. */
export function wordsNeverLogged(userId: string | undefined | null): boolean {
  return isAnonymousDemoUser(userId) || isThirdPartyCallUser(userId);
}
