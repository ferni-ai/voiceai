/**
 * Whether a reply request is clear of crisis handling, for the dev model trial
 * (CASCADE_TRIAL_MODEL, model-provider/trial-lane.ts). Only a clear request may go to a model
 * other than today's; every other request keeps today's routing.
 *
 * Fails closed: unknown is never clear. A request is clear only when the gate sent it on a call
 * with a session id, did not ask for the main model, passed this turn live, the call has had no
 * guided or replaced turn, no crisis risk is noted on the call and no other crisis read is in
 * flight. A pending classifier verdict is clear only when it is this turn's own, holding this
 * very reply, and CRISIS_GATE_FAIL_CLOSED is on; any other pending verdict is not. A reader that
 * throws is not clear.
 *
 * A held reply the trial model wrote goes out only after a clean read (heldTrialReplyCleared):
 * a read that failed, timed out or found risk sends the turn back to today's model.
 *
 * @module agents/safety/crisis-trial-clearance
 */
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { crisisGuidedTurn } from '../../services/safety/crisis-turn-mark.js';
import type { HeldVerdict, SentBy } from '../model-provider/lane-request.js';
import { sessionScope } from '../personas/crisis-gate-words.js';
import { escalationFailsClosed } from '../personas/crisis-gate-failure.js';
import { crisisDecidedOn, crisisVerdictPending } from './crisis-gate-signal.js';

type Env = Record<string, string | undefined>;

/** Verdicts whose held reply the trial model wrote. */
const trialHolds = new WeakSet<object>();

/** The call's id when no crisis handling has touched it, else undefined. */
function untouchedCall(session: object): string | undefined {
  const { userData } = session as { userData?: unknown };
  const call = sessionScope(userData);
  if (call === undefined || crisisGuidedTurn(userData) || crisisDecidedOn(session))
    return undefined;
  return call;
}

/** Whether this request may leave today's model: see the module comment. */
export function clearOfCrisis(gate: SentBy | undefined, mainLane: boolean, env: Env): boolean {
  if (!gate || mainLane) return false;
  try {
    const call = untouchedCall(gate.session);
    if (call === undefined) return false;
    const pending = crisisVerdictPending(gate.session);
    const own = !!gate.held && pending === gate.held.verdict;
    if (pending !== null && !(own && escalationFailsClosed(env))) return false;
    // This turn's own read is in flight while it holds the reply: only other reads count.
    return !crisisRiskThisCall(call, own ? gate.held?.latest : undefined);
  } catch {
    return false;
  }
}

/** The trial model is writing the reply `held` holds. */
export function noteTrialHeld(held: HeldVerdict): void {
  trialHolds.add(held.verdict);
}

/**
 * Whether the reply `held` holds may go out once its verdict settled with no decision: always,
 * unless the trial model wrote it; then only after a clean read (no risk noted, no decision).
 */
export function heldTrialReplyCleared(session: object, held: HeldVerdict): boolean {
  if (!trialHolds.has(held.verdict)) return true;
  try {
    const call = untouchedCall(session);
    return call !== undefined && !crisisRiskThisCall(call, held.latest);
  } catch {
    return false;
  }
}
