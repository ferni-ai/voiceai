/**
 * Ferni never ends the call of a caller under a minor-care hold: not the gateway's step-away exit
 * (gateway/step-away-crisis-hold.ts) and not the goodbye wrap-up (call-wrap-up.ts). The caller
 * can still end it themselves.
 *
 * The hold is read the way the caller card reads it (caller-card/wiring.ts): this session's hold
 * (minorHeld), then the account hold (userHeld, then sharedHeldStrict, where an unreadable or late
 * record means held).
 *
 * @module agents/shared/minor-care-end-hold
 */
import type { Env } from '../../config/env-flag.js';
import { sharedHeldStrict } from '../../services/outreach/minor-care-shared-hold.js';
import { minorHeld, sessionUser, userHeld } from '../../utils/minor-care.js';

/** This caller's account-level minor-care hold, failing closed. */
export type AccountHeld = (userId: string | undefined, env: Env) => Promise<boolean>;

/** What Ferni is told instead of ending a care-held minor's call (app wrap-up and phone). */
export const MINOR_CARE_HOLD =
  "Don't hang up: stay on the line with them. The call ends when they hang up.";

/** The in-process part of the hold, read with no wait: this session's, then the account's. */
function heldInProcess(sessionId: string, env: Env): MinorCareHoldReason | null {
  if (minorHeld(sessionId, env)) return 'minor_care';
  return userHeld(sessionUser(sessionId), env) ? 'minor_care_account' : null;
}

/** The caller card's check: in-process first, then the shared record. */
const accountHeldStrict: AccountHeld = async (userId, env) =>
  userHeld(userId, env) || sharedHeldStrict(userId, env);

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
