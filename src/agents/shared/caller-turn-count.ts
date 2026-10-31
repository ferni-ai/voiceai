/**
 * Which caller turn a call is on: 1, 2, 3... one step per distinct turn the caller
 * takes, however many times anything else counts it.
 *
 * userData.turnCount cannot do this. On the live voice path it steps once in
 * voice-agent-entry/handler-setup.ts for every final transcript and again in
 * voice-agent/transcript-handler.ts (processFinalTranscript), so three turns
 * read as six, and a spoken turn split into several finals counts several more.
 * Other readers depend on that, so it is left alone. The crisis follow-up note
 * (CRISIS_SAME_CALL_NOTE_FADES) fades by caller turns, so it reads this instead.
 *
 * The turn context pusher (turn-intelligence.ts) knows where a turn begins: the
 * first final transcript after Ferni starts to think or speak. It names each turn
 * with a fresh key and sends it to the hook with every segment of that turn, so the
 * hook can run several times for one turn and still count it once.
 *
 * @module agents/shared/caller-turn-count
 */

/** The key, in the `extra` of the message the pusher hands the hook, of the caller turn's name. */
export const CALLER_TURN_KEY = 'callerTurnKey';

const calls = new Map<string, { lastKey: string | undefined; turn: number }>();
/** A call that has ended is never read again; the oldest are dropped past this. */
const MAX_CALLS = 500;

/**
 * The caller turn named `turnKey` on this call. A key not seen before is the next
 * turn; the one just counted is the same turn, however often it comes; no key counts
 * as a new turn each time. Keys are per turn, never per pusher, so a persona handoff
 * (a new pusher on the same call) carries on from the call's count.
 */
export function callerTurnFor(sessionId: string, turnKey: string | undefined): number {
  const seen = calls.get(sessionId) ?? { lastKey: undefined, turn: 0 };
  if (turnKey === undefined || turnKey !== seen.lastKey) seen.turn += 1;
  seen.lastKey = turnKey;
  calls.delete(sessionId); // re-insert: the oldest call is the first key
  calls.set(sessionId, seen);
  if (calls.size > MAX_CALLS) calls.delete(calls.keys().next().value as string);
  return seen.turn;
}

/** userData carrying the caller turn; the turn hook sets it, the crisis note's readers take it. */
export type WithCallerTurn = { callerTurn?: number };

/** The caller turn the hook handed this turn's builders, if it did. */
export function callerTurnOf(userData: object): number | undefined {
  return (userData as WithCallerTurn).callerTurn;
}
