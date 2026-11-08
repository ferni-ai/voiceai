/**
 * CALL_PATHS_PLACE_OR_HOLD: calls placed by tools other than callOnBehalf (the
 * backgroundCall tool and the referral calls) go through placeOrHold, as
 * callOnBehalf's do, so the recipient's call hours, the do-not-call list and call
 * compliance apply. Both used to dial on their own engine, past those checks.
 *
 * This is the tools side. Tools can't reach services/outreach, so the placer is
 * installed from there (gated-call-paths.ts, by live-call-behaviors.ts). With the
 * flag on and no placer installed, the call is refused: nothing rings unchecked.
 *
 * @module tools/domains/telephony/gated-call-port
 */
import { flagOn } from '../../../config/env-flag.js';
import type { CallObjective, CallType } from './types.js';

/** Whether the backgroundCall tool and the referral calls go through placeOrHold. */
export function callPathsGated(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('CALL_PATHS_PLACE_OR_HOLD', env);
}

/** A call one of those tools wants placed. */
export interface GatedCall {
  userId: string;
  /** The requester's name as the agent says it; read from their profile when absent. */
  userName?: string;
  sessionId?: string;
  contactName: string;
  phone: string;
  /** What the recipient hears: said to them, so never "you" for the requester. */
  purpose: string;
  /** The purpose as said to the requester ("let Ana know you're thinking of them"). */
  requesterPurpose?: string;
  /** What the agent should know or say, beyond the purpose. */
  context?: string;
  objective: CallObjective;
  callType: CallType;
}

/** Ringing now (its call id), held for a better hour, or refused: nothing rang. */
export type Placement = { placed: string } | { held: string } | { refused: string };

type GatedCallPlacer = (call: GatedCall) => Promise<Placement>;
let placer: GatedCallPlacer | undefined;

/** Install the placer (services/outreach/gated-call-paths.ts). */
export function setGatedCallPort(next: GatedCallPlacer | undefined): void {
  placer = next;
}

/** Place `call` through placeOrHold, or refuse it when no placer is installed. */
export async function placeGatedCall(call: GatedCall): Promise<Placement> {
  return placer ? placer(call) : { refused: "calls can't be placed from here yet" };
}
