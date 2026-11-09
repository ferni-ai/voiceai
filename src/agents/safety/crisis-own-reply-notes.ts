/**
 * The voice agent's writers note whether the reply they are producing offers crisis
 * help (CRISIS_OWN_SCRIPT_NOT_EVIDENCE, services/safety/crisis-own-reply.ts): the reply
 * gate for its crisis guidance or script, the turn handler for its crisis response.
 *
 * @module CrisisOwnReplyNotes
 */

import { noteCrisisHelp, type OwnCrisisReplyState } from '../../services/safety/index.js';

/** The gate's crisis guidance and scripts (decisionFor), not its soft check-ins or eased guides. */
const crisisHelp = new WeakSet<object>();

/** Marks a gate decision that offers crisis help; a pass offers none. */
export function markCrisisHelp<T extends { action: string }>(decision: T): T {
  if (decision.action !== 'pass') crisisHelp.add(decision);
  return decision;
}

/** The gate notes whether the reply it is producing offers crisis help (a marked decision). */
export function noteGateCrisisHelp(userData: unknown, decision: object | undefined): void {
  if (typeof userData !== 'object' || userData === null) return;
  noteCrisisHelp(userData as OwnCrisisReplyState, 'gate', !!decision && crisisHelp.has(decision));
}

/** The turn's crisis result as the turn handler acts on it (a CrisisDetectionResult). */
interface TurnCrisisResult {
  shouldOverrideLLM?: boolean;
  suggestedResponse?: string;
  isCrisis?: boolean;
}

/** The turn handler notes whether its reply is its crisis script or crisis guidance. */
export function noteTurnCrisisHelp(state: OwnCrisisReplyState, crisis?: TurnCrisisResult): void {
  const required = !!(crisis?.shouldOverrideLLM && crisis.suggestedResponse);
  noteCrisisHelp(state, 'turn', required || !!crisis?.isCrisis);
}
