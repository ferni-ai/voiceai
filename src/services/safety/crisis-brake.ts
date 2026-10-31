/**
 * CRISIS_BRAKE_V2 (off by default): crisis mode can ease once it started (prod 10-17 to 10-31: the
 * gate eased 0 turns in 14 days). Used by crisis-agreement.ts, crisis-imminent-agreement.ts,
 * crisis-script-answer.ts and crisis-line-once.ts. Never without a call, nor for a caller who may
 * be under 18 (MINOR_CARE's signals or an age said): those calls read as with the flag off.
 * @module CrisisBrake
 */

import { ageSignal, derivedHold, statesUnder18 } from '../../utils/minor-care.js';

type Env = Record<string, string | undefined>;

export function resolveCrisisBrakeV2(env: Env = process.env): boolean {
  return env.CRISIS_BRAKE_V2?.trim().toLowerCase() === 'on';
}

/** Calls where a caller may be under 18: the brake stays off for the rest of the call. */
const MAX_CALLS = 2048;
const minorCalls = new Set<string>();

/** Whether the brake applies to this turn of this call; `lines` are the caller's words. */
export function crisisBrakeOn(
  env: Env | undefined,
  call: string | undefined,
  lines: readonly unknown[]
): boolean {
  if (!resolveCrisisBrakeV2(env ?? process.env) || !call) return false;
  try {
    if (minorCalls.has(call) || lines.some((line) => typeof line !== 'string')) return false;
    const said = lines as readonly string[];
    if (!ageSignal(call) && !derivedHold(call) && !said.some((l) => statesUnder18(l))) return true;
    const oldest = minorCalls.size >= MAX_CALLS ? minorCalls.values().next().value : undefined;
    if (oldest !== undefined) minorCalls.delete(oldest);
    minorCalls.add(call);
    return false;
  } catch {
    return false; // as with the flag off
  }
}

/** For tests. */
export function resetCrisisBrake(): void {
  minorCalls.clear();
}
