/**
 * HANDOFF_ARRIVAL_ONCE (default off): a persona the caller already met this call
 * doesn't introduce themselves again. On a quick back-and-forth (Ferni → Maya →
 * Ferni → Maya) the canned opener is a random one of three, so a return often
 * says the very line the caller already heard, which sounds like a switchboard,
 * not friends (#1922, #1489).
 *
 * Per call, it remembers who the caller has met and every arrival line spoken:
 * - a first meeting is unchanged;
 * - a return swaps the canned opener (or any line already said) for a short
 *   "back again" line not yet said (RETURNING_OPENERS), or no arrival line once
 *   those are used up (SILENT_WHEN_RETURN_LINES_USED_UP), never a repeat. A
 *   briefed first line written for this moment and not yet said is kept;
 * - once crisis handling touches the call (the gate acted on, or holds a verdict
 *   on, any session seen at a hop), every later line is spoken exactly as without
 *   the flag: never swapped, never dropped. Sticky for the call, because with a
 *   session per persona (MULTI_AGENT_SINGLE_SESSION off) a later hop's sessions
 *   are not the one the crisis happened on.
 *
 * Arrival lines only: goodbyes, safety and disclosure lines never pass through here.
 * Kept in memory only, keyed by call, and forgotten when the call ends
 * (orchestrator.ts shutdown).
 *
 * @module agents/multi-agent/arrival-once
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { familyArrival } from './family-table.js';
import { arrivalLine } from './handoff-brief.js';

/**
 * A persona the caller already met this call coming back: a short "back again"
 * line in their own voice instead of introducing themselves again (first-meeting
 * openers live in services/team-engagement/banter.ts). Two each; once both are
 * said this call, the persona comes back without an arrival line rather than
 * repeat one.
 */
export const RETURNING_OPENERS: Readonly<Record<string, readonly string[]>> = {
  ferni: ["I'm back. Where were we?", "Me again. Okay, I'm with you."],
  'maya-santos': ["Maya again! I'm right here.", 'Back with you. Where are we at?'],
  'jordan-taylor': ['Jordan again! Okay, where were we?', "Back! Let's keep it moving."],
  'alex-chen': ["Alex again. Let's pick it up.", "Back with you. What's next?"],
  'peter-john': ['Peter again! Okay, where were we?', 'Back. Still curious, go on.'],
  'nayan-patel': [
    "Nayan again. <break time='200ms'/> I'm here.",
    "Back with you. <break time='200ms'/> Take your time.",
  ],
  'john-bogle': ['Hello again, friend.', "Back again. Let's keep at it, slowly."],
  'peter-lynch': ['Back! What else have you noticed?', 'Hi again. Where were we?'],
  'joel-dickson': ['Nate again! Okay, go.', "Back! Where'd we land?"],
};

/**
 * A return with both RETURNING_OPENERS lines already said this call: true comes
 * back with no arrival line (the caller hears the goodbye, then the persona when
 * they speak); false says today's line, even though the caller heard it. Silent
 * is a humanness call still open with the product owner: flip it here only.
 */
export const SILENT_WHEN_RETURN_LINES_USED_UP = true;

/** One call's memory: personas met, arrival lines spoken (by lineId), and whether crisis handling touched it. */
interface CallArrivals {
  met: Set<string>;
  spoken: Set<string>;
  /** Never reset within the call: a pending verdict that clears still counts. */
  crisis: boolean;
}

/** A bound on calls a crashed worker never ended, like family-table.ts. */
const MAX_CALLS = 500;
const calls = new Map<string, CallArrivals>();

function arrivalOnceOn(env: Env): boolean {
  return flagOn('HANDOFF_ARRIVAL_ONCE', env);
}

function arrivalsFor(callId: string): CallArrivals {
  const known = calls.get(callId);
  if (known) return known;
  const oldest = calls.keys().next();
  if (calls.size >= MAX_CALLS && !oldest.done) calls.delete(oldest.value);
  const fresh: CallArrivals = { met: new Set(), spoken: new Set(), crisis: false };
  calls.set(callId, fresh);
  return fresh;
}

/** The words of a line, without SSML, case or punctuation: the same line said twice has one id. */
function lineId(line: string): string {
  return line
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();
}

function nearCrisis(sessions: readonly unknown[]): boolean {
  return sessions.some(
    (s) =>
      crisisDecidedOn(s) ||
      (typeof s === 'object' && s !== null && crisisVerdictPending(s) !== null)
  );
}

export interface ArrivalHop {
  to: string;
  from: string;
  /** This hop's sessions (outgoing and incoming): crisis handling on any keeps this and every later line. */
  sessions: readonly unknown[];
  /** The line was briefed for this moment (BRIEFED_HANDOFF, HANDOFF_DESK), not canned banter. */
  briefed: boolean;
}

/** The line `hop.to` arrives with this call, or null for no arrival line (a return with every variant said). */
export function arrivalOnce(callId: string, hop: ArrivalHop, line: string): string | null {
  const call = arrivalsFor(callId);
  call.met.add(hop.from);
  const returning = call.met.has(hop.to);
  call.met.add(hop.to);
  call.crisis ||= nearCrisis(hop.sessions);
  const fresh = !call.spoken.has(lineId(line));
  const keep = call.crisis || !returning || (hop.briefed && fresh);
  const unsaid = (RETURNING_OPENERS[hop.to] ?? []).find((l) => !call.spoken.has(lineId(l)));
  const chosen = keep ? line : (unsaid ?? (SILENT_WHEN_RETURN_LINES_USED_UP ? null : line));
  if (chosen !== null) call.spoken.add(lineId(chosen));
  return chosen;
}

/** The call ended: forget it. */
export function forgetArrivals(callId: string): void {
  calls.delete(callId);
}

/**
 * The arriving persona's first line for this call (orchestrator.ts getGreetingPhrase):
 * the briefed line or banter, after any word back (family-table.ts), or null for no line.
 * Flag off: exactly familyArrival, as before this flag.
 */
export function arrivalGreeting(
  callId: string,
  arrival: { to: string; from: string; firstLine?: string; sessions: readonly unknown[] },
  env: Env = process.env
): string | null {
  const { to, from, firstLine, sessions } = arrival;
  if (!arrivalOnceOn(env)) return familyArrival(to, from, callId, firstLine, env);
  const hop = { to, from, sessions, briefed: firstLine !== undefined };
  const once = arrivalOnce(callId, hop, firstLine ?? arrivalLine(to, from, env));
  return once === null ? null : familyArrival(to, from, callId, once, env);
}
