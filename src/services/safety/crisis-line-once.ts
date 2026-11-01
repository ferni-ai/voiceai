/**
 * The crisis line said once in full per call (#1464, CRISIS_BRAKE_V2). Seth, 2026-10-15: "At most
 * one full 988 mention per call ... Any NEW risk signal still gets the full response." Nothing is
 * withheld: once Ferni's own words gave a line (offersCrisisLine), a later crisis turn about the
 * caller keeps crisis mode and the 988 number, with one note to give it again briefly in its own
 * words instead of re-reading the script. An imminent read is never touched (main's 911 script),
 * and every imminent read is noted for the call (crisis-call-risk.ts: nothing on it eases again).
 * @module CrisisLineOnce
 */

import { crisisBrakeOn } from './crisis-brake.js';
import { buildCrisisGuidance, type CrisisDetectionResult } from './crisis-guard.js';
import { noteImminentRead } from './crisis-call-risk.js';
import { offersCrisisLine } from './crisis-line-speech.js';

/** The indicator a turn on a call that heard the line carries (crisis-guard.ts adds the note). */
export const LINE_GIVEN = 'crisis_line_given';
/** An imminent read, the patterns' or the classifier's (crisis-guard.ts). */
const IMMINENT = 'imminent_danger';

export interface LineTurn {
  call?: string;
  latest: string;
  earlier: readonly string[];
  /** Ferni's lines since the caller last spoke (the reply gate), or the last one (the pipeline). */
  ferni: ReadonlyArray<string | undefined>;
  /** The turn reads as on main: a 'main' answer to the 911 script (crisis-script-answer.ts). */
  fullLine?: boolean;
  env?: Record<string, string | undefined>;
  now?: number;
}

/** Calls whose caller heard a crisis line, in memory for 6 hours like call risk. */
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS = 2048;
const heardAt = new Map<string, number>();

/** Notes a crisis line in Ferni's words; whether this call has heard one. */
function lineHeard(turn: LineTurn): boolean {
  const { call, now = Date.now() } = turn;
  if (!call || !crisisBrakeOn(turn.env, call, [turn.latest, ...turn.earlier])) return false;
  if (turn.ferni.some((line) => typeof line === 'string' && offersCrisisLine(line))) {
    for (const [id, at] of heardAt) if (now - at > TTL_MS) heardAt.delete(id);
    const oldest = heardAt.size >= MAX_CALLS ? heardAt.keys().next().value : undefined;
    if (oldest !== undefined) heardAt.delete(oldest);
    heardAt.set(call, now);
  }
  const at = heardAt.get(call);
  return at !== undefined && now - at <= TTL_MS;
}

/**
 * This turn's crisis read, marked when the call already heard the line and the read is
 * crisis-level; the read itself otherwise (same object). Call on every turn: it notes the line
 * from Ferni's words and an imminent read for the call.
 */
export function withLineOnce<
  T extends { isCrisis: boolean; indicators: string[]; subject?: string },
>(crisis: T, turn: LineTurn): T {
  try {
    if (crisis.indicators.includes(IMMINENT)) noteImminentRead(turn.call, turn.latest);
    if (!lineHeard(turn) || !crisis.isCrisis || crisis.subject !== 'self') return crisis;
    if (crisis.indicators.includes(IMMINENT) || turn.fullLine) return crisis; // as on main
    return { ...crisis, indicators: [...crisis.indicators, LINE_GIVEN] };
  } catch {
    return crisis; // as on main
  }
}

const NOTE =
  "They already heard the 988 number on this call. Give it again in one short, natural sentence of your own; don't re-read the crisis script or repeat the same wording.";

/** Main's crisis guidance (buildCrisisGuidance), with the note once the call heard the line. */
export function crisisGuidanceOnce(crisis: CrisisDetectionResult): string {
  const guidance = buildCrisisGuidance(crisis);
  return crisis.indicators.includes(LINE_GIVEN) ? `${guidance}\n\n${NOTE}` : guidance;
}
