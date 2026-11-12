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
