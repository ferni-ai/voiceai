/**
 * The TURN_RECEIPT's experiment arms for one turn (turn-receipt.ts build).
 *
 * - `latencyArm`: the call's LATENCY_ARM_PERCENT arm, or null (latency-arm.ts). Always present.
 * - `trial`: the dev model trial's field for the request the tokens are from, present only
 *   while CASCADE_TRIAL_MODEL is on (trial-lane.ts trialField), so a receipt with the trial
 *   off is unchanged.
 *
 * @module agents/shared/turn-receipt-arms
 */
import { latencyArmFor, type LatencyArm } from '../../services/platform/latency-arm.js';
import { trialField, type TrialField, type TrialSlot } from '../model-provider/trial-lane.js';

/** The receipt's arm fields; `trial` only with the trial on. */
export function armFields(
  sessionId: string,
  trial: TrialSlot | null | undefined
): { latencyArm: LatencyArm | null; trial?: TrialField } {
  const latencyArm = latencyArmFor(sessionId);
  return trial ? { latencyArm, trial: trialField(trial) } : { latencyArm };
}
