/**
 * Whether a reply request is clear of crisis handling, for the dev model trial
 * (CASCADE_TRIAL_MODEL, model-provider/trial-lane.ts). Only a clear request may go to a model
 * other than today's; every other request keeps today's routing.
 *
 * Fails closed: unknown is never clear. A request is clear only when the gate sent it on a call
 * with a session id, passed this turn live, the call has had no guided or replaced turn, no
 * crisis risk is noted on the call and no other crisis read is in flight. (The trial lane itself
 * refuses a request marked for the main model.) A pending classifier verdict is clear only when it is this turn's own, holding this
 * very reply, and CRISIS_GATE_FAIL_CLOSED is on; any other pending verdict is not. A reader that
 * throws is not clear.
 *
 * A held reply the trial model wrote goes out only after a clean read (heldTrialReplyCleared):
 * a read that failed, timed out or found risk sends the turn back to today's model.
 *
 * @module agents/safety/crisis-trial-clearance
 */
import { crisisGuidedTurn, crisisRiskThisCall } from '../../services/safety/index.js';
import type { TrialClearance } from '../model-provider/lane-request.js';
import { sessionScope } from '../personas/crisis-gate-words.js';
import { escalationFailsClosed } from '../personas/crisis-gate-failure.js';
import { crisisDecidedOn, crisisVerdictPending } from './crisis-gate-signal.js';

type Env = Record<string, string | undefined>;

/** A reply held until this turn's own classifier verdict settles (crisis-gate-hold.ts). */
interface HeldVerdict {
  verdict: Promise<unknown>;
  latest: string;
}

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

/** Whether a request on `session`, held on `held`, may leave today's model: see the top. */
function clearOfCrisis(session: object, held: HeldVerdict | undefined, env: Env): boolean {
  try {
    const call = untouchedCall(session);
    if (call === undefined) return false;
    const pending = crisisVerdictPending(session);
    const own = !!held && pending === held.verdict;
    if (pending !== null && !(own && escalationFailsClosed(env))) return false;
    // This turn's own read is in flight while it holds the reply: only other reads count.
    return !crisisRiskThisCall(call, own ? held?.latest : undefined);
  } catch {
    return false;
  }
}

/**
 * The clearance the gate puts on a reply request it sends on `session` (lane-request.ts), held on
 * `held` when this turn's reply waits for its own verdict. The trial asks it at the model.
 */
export function trialClearance(session: object, held?: HeldVerdict): TrialClearance {
  return {
    callId: () => sessionScope((session as { userData?: unknown }).userData),
    clear: (env) => clearOfCrisis(session, held, env),
    noteTrialWrote: () => {
      if (held) trialHolds.add(held.verdict);
    },
  };
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
