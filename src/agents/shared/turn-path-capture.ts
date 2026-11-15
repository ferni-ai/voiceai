/**
 * Which site captures a caller line to memory (TURN_PATH_SINGLE_CAPTURE, #3892).
 *
 * When the turn path runs for a call (attachTurnContextPusher: multi-agent, TURN_INTELLIGENCE
 * on), processTurn and the turn handler capture each line, so with the flag on the transcript
 * handler leaves the line to them instead of capturing it a second time. A single-agent call
 * or TURN_INTELLIGENCE=off never attaches the turn path, so the transcript handler's capture,
 * the only one there, stays.
 *
 * @module agents/shared/turn-path-capture
 */
import { flagOn } from '../../config/env-flag.js';

/**
 * Sessions the turn path is attached to. Keyed by the session object, so an entry is
 * collected with its session and nothing outlives the call. Never cleared mid-call: a
 * persona swapped in on the same session attaches again before the outgoing one detaches,
 * and TURN_INTELLIGENCE does not change during a call.
 */
const turnPathSessions = new WeakSet<object>();

/** Records that the turn path now handles this session's caller lines. */
export function noteTurnPathAttached(session: object): void {
  turnPathSessions.add(session);
}

/** True when the transcript handler should leave this session's line to the turn path. */
export function transcriptCaptureSkipped(session: object): boolean {
  return turnPathSessions.has(session) && flagOn('TURN_PATH_SINGLE_CAPTURE');
}
