/**
 * Ferni never ends the call of a caller under a minor-care hold: not the gateway's step-away exit
 * (gateway/step-away-crisis-hold.ts) and not the goodbye wrap-up (call-wrap-up.ts). The caller
 * can still end it themselves.
 *
 * Only an age hold ends nothing: this session's (minorHeld), then a signed-in caller's account
 * hold (userAgeHeld, then the shared record, where an unreadable or late record means held). An
 * anonymous try-first caller has no account hold, and a sexual-topic hold (a data hold, not an
 * age one) doesn't keep a call open: both end like any other call, unless this session is held.
 *
 * @module agents/shared/minor-care-end-hold
 */
import type { Env } from '../../config/env-flag.js';
import { sharedRecordHeldStrict } from '../../services/outreach/minor-care-shared-hold.js';
import { minorHeld, sessionUser, userAgeHeld } from '../../utils/minor-care.js';
import { isAnonymousDemoUser } from '../../utils/synthetic-user.js';

/** This caller's account-level minor-care hold, failing closed. */
export type AccountHeld = (userId: string | undefined, env: Env) => Promise<boolean>;

/** What Ferni is told instead of ending a care-held minor's call (app wrap-up and phone). */
export const MINOR_CARE_HOLD =
  "Don't hang up: stay on the line with them. The call ends when they hang up.";

/** A caller with an account: an anonymous try-first visitor has none to hold. */
const signedIn = (userId: string | undefined): userId is string =>
  !!userId && !isAnonymousDemoUser(userId);

/** The in-process part of the hold, read with no wait: this session's, then the account's. */
function heldInProcess(sessionId: string, env: Env): MinorCareHoldReason | null {
  if (minorHeld(sessionId, env)) return 'minor_care';
  const userId = sessionUser(sessionId);
  return signedIn(userId) && userAgeHeld(userId, env) ? 'minor_care_account' : null;
}

/** A signed-in caller's age hold: in-process first, then the shared record. */
const accountHeldStrict: AccountHeld = async (userId, env) =>
  signedIn(userId) && (userAgeHeld(userId, env) || sharedRecordHeldStrict(userId, env));

export type MinorCareHoldReason = 'minor_care' | 'minor_care_account' | 'minor_care_unreadable';

/** Why this call must not be ended by Ferni for minor care, or null. Never rejects. */
export async function minorCareHoldReason(
  sessionId: string,
  env: Env = process.env,
  accountHeld: AccountHeld = accountHeldStrict
): Promise<MinorCareHoldReason | null> {
  try {
    if (minorHeld(sessionId, env)) return 'minor_care';
    return (await accountHeld(sessionUser(sessionId), env)) ? 'minor_care_account' : null;
  } catch {
    return 'minor_care_unreadable'; // fail closed
  }
}

/**
 * The hold once the goodbye has played: the read started before it (`pending`, from
 * minorCareHoldReason), then the in-process hold again, which may have landed while it played.
 */
export async function minorCareHoldAfterGoodbye(
  sessionId: string,
  pending: Promise<MinorCareHoldReason | null>,
  env: Env = process.env
): Promise<MinorCareHoldReason | null> {
  const read = await pending;
  if (read) return read;
  try {
    return heldInProcess(sessionId, env);
  } catch {
    return 'minor_care_unreadable'; // fail closed
  }
}
