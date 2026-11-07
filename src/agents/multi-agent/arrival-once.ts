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
 *   "back again" line not yet said (RETURNING_OPENERS); once those are used up,
 *   today's line (SILENT_WHEN_RETURN_LINES_USED_UP). A briefed first line written
 *   for this moment and not yet said is kept;
 * - once crisis handling touches the call (the gate acted on, or holds a verdict
 *   on, any session seen at any hop this call, or a classifier read is in flight
 *   on the call or any of those sessions' calls), this and every later line is
 *   spoken exactly as without the flag: never swapped, never dropped. So while a
 *   crisis read is pending, the arrival line is the flag-off line: the crisis gate
 *   reads the arrival line as the companion turn, and it sees the same words it
 *   would with the flag off. Every hop reads every session seen so far, and the
 *   mark is sticky for the call: with a session per persona
 *   (MULTI_AGENT_SINGLE_SESSION off) a crisis can land on a session after its
 *   persona left, and a later hop's own sessions are not that one.
 *
 * Arrival lines only: goodbyes, safety and disclosure lines never pass through here.
 * Kept in memory only, keyed by call, and forgotten when the call ends
 * (orchestrator.ts shutdown).
 *
 * @module agents/multi-agent/arrival-once
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { crisisReadInFlight } from '../../services/safety/index.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { familyArrival } from './family-table.js';
import { arrivalLine } from './handoff-brief.js';

/**
 * A persona the caller already met this call coming back: a short "back again"
 * line in their own voice instead of introducing themselves again (first-meeting
 * openers live in services/team-engagement/banter.ts). Two each; once both are
 * said this call, a return says today's line (SILENT_WHEN_RETURN_LINES_USED_UP).
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
 * A return with both RETURNING_OPENERS lines already said this call: false (the
 * default) says today's line, a short spoken line, because silence on a hop reads
 * as dead air; true comes back with no arrival line (the caller hears the goodbye,
 * then the persona when they speak). A product call for the owner: flip it here only.
 */
export const SILENT_WHEN_RETURN_LINES_USED_UP = false;

/** One call's memory: personas met, arrival lines spoken (by lineId), and whether crisis handling touched it. */
interface CallArrivals {
  met: Set<string>;
  spoken: Set<string>;
  /**
   * Every session seen at a hop this call. A crisis can land on a session after its
   * persona left (a classifier read still out at the hop), so each hop reads them all.
   */
  sessionsSeen: Set<unknown>;
  /**
   * Never reset within the call: a pending verdict or an in-flight read that later
   * clears clean still counts, so every later line stays the flag-off line.
   */
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
  const fresh: CallArrivals = {
    met: new Set(),
    spoken: new Set(),
    sessionsSeen: new Set(),
    crisis: false,
  };
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

/**
 * The key the reply gate files a session's crisis reads under: `sessionScope`
 * (crisis-gate-words.ts), the session's `services.sessionId`, an empty id as none.
 * Read here, not imported from crisis-gate-words.ts, whose imports reach the session registry.
 */
function gateKeyOf(session: unknown): string | undefined {
  const userData = (session as { userData?: { services?: { sessionId?: unknown } } } | null)
    ?.userData;
  const id = userData?.services?.sessionId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/** A crisis classifier read is in flight on this call or on the call of any session seen. */
function crisisReadPending(callId: string, sessions: readonly unknown[]): boolean {
  return [callId, ...sessions.map(gateKeyOf)].some(
    (id) => id !== undefined && crisisReadInFlight(id)
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

/** The line `hop.to` arrives with this call, or null for no arrival line (only when SILENT_WHEN_RETURN_LINES_USED_UP). */
export function arrivalOnce(callId: string, hop: ArrivalHop, line: string): string | null {
  const call = arrivalsFor(callId);
  call.met.add(hop.from);
  const returning = call.met.has(hop.to);
  call.met.add(hop.to);
  for (const s of hop.sessions) call.sessionsSeen.add(s);
  const seen = [...call.sessionsSeen];
  call.crisis ||= nearCrisis(seen) || crisisReadPending(callId, seen);
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
