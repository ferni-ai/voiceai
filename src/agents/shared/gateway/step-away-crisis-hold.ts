/**
 * The gateway's step-away exit (reconnection.ts triggerGracefulExit) tells the app to hang up
 * after the LLM fails three times in a row. It never does that to a caller at risk:
 * - crisis risk on this call, or a crisis read still in flight (crisis-call-risk.ts);
 * - this session's minor-care hold (minorHeld);
 * - this caller's account hold, read the way the caller card reads it (userHeld, then
 *   sharedHeldStrict, where an unreadable or late record means held).
 * Held, Ferni stays on the line and the caller ends the call.
 *
 * Why: before #3749 the multi-agent path never delivered that `conversation_end`, so the exit
 * only spoke. Once it arrives, prod web (wrap-up off) hangs up 2.5 s after "step away".
 *
 * @module agents/shared/gateway/step-away-crisis-hold
 */
import type { Env } from '../../../config/env-flag.js';
import { crisisRiskThisCall } from '../../../services/safety/index.js';
import { sharedHeldStrict } from '../../../services/outreach/minor-care-shared-hold.js';
import { minorHeld, sessionUser, userHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'step-away-crisis-hold' });

/** What Ferni says, once per call, when the exit is held instead of stepping away. */
export const STILL_HERE_LINE = "I'm still here whenever you want to keep talking.";

/** Where in the exit the check ran: before the step-away line, or just before the signal. */
export type StepAwayStage = 'before_line' | 'before_signal';

/** This caller's account-level minor-care hold, failing closed. */
export type AccountHeld = (userId: string | undefined, env: Env) => Promise<boolean>;

/** The caller card's check (caller-card/wiring.ts): in-process first, then the shared record. */
const accountHeldStrict: AccountHeld = async (userId, env) =>
  userHeld(userId, env) || sharedHeldStrict(userId, env);

/** Why the exit is held for this call, or null when it may go ahead. */
async function heldBecause(
  sessionId: string,
  env: Env,
  accountHeld: AccountHeld
): Promise<string | null> {
  if (crisisRiskThisCall(sessionId)) return 'crisis';
  if (minorHeld(sessionId, env)) return 'minor_care';
  try {
    return (await accountHeld(sessionUser(sessionId), env)) ? 'minor_care_account' : null;
  } catch {
    return 'minor_care_unreadable'; // fail closed
  }
}

/**
 * True when the step-away exit must not end this call. Logs GRACEFUL_EXIT_HELD_CRISIS with
 * the reason (no words) so prod can see it.
 */
export async function holdStepAwayForCrisis(
  sessionId: string,
  stage: StepAwayStage,
  env: Env = process.env,
  accountHeld: AccountHeld = accountHeldStrict
): Promise<boolean> {
  const why = await heldBecause(sessionId, env, accountHeld);
  if (why === null) return false;
  log.warn({ sessionId, stage, why }, 'GRACEFUL_EXIT_HELD_CRISIS');
  return true;
}
