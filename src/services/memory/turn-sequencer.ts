/**
 * Turn Sequencer
 *
 * One monotonic turn counter per live voice session, shared by the user and
 * assistant capture paths, plus the time of the last real conversational
 * activity (a transcript or a spoken reply).
 *
 * - `turnNumber` on every persisted turn and on every dynamic-memory capture
 *   comes from here, so both roles interleave in the order they happened.
 * - The session-end wait uses `getLastActivityAt` to tell a quiet-but-live
 *   call from a dead one.
 *
 * State is in-process only: a session lives on one worker for its whole life,
 * and a reconnect starts a new conversation document anyway.
 *
 * @module services/memory/turn-sequencer
 */

interface SessionSequence {
  lastTurnNumber: number;
  lastActivityAt: number;
}

const sequences = new Map<string, SessionSequence>();

/** Hard cap so a leak (session that never ends) cannot grow without bound. */
const MAX_TRACKED_SESSIONS = 5_000;

function getOrCreate(sessionId: string, now: number): SessionSequence {
  let seq = sequences.get(sessionId);
  if (!seq) {
    if (sequences.size >= MAX_TRACKED_SESSIONS) {
      // Drop the oldest entry (Map preserves insertion order)
      const oldest = sequences.keys().next().value;
      if (oldest !== undefined) sequences.delete(oldest);
    }
    seq = { lastTurnNumber: 0, lastActivityAt: now };
    sequences.set(sessionId, seq);
  }
  return seq;
}

/**
 * Allocate the next turn number for a session (1, 2, 3, ...).
 * Also counts as activity.
 */
export function nextTurnNumber(sessionId: string, now: number = Date.now()): number {
  const seq = getOrCreate(sessionId, now);
  seq.lastTurnNumber += 1;
  seq.lastActivityAt = now;
  return seq.lastTurnNumber;
}

/** The last turn number handed out for this session (0 if none). */
export function currentTurnNumber(sessionId: string): number {
  return sequences.get(sessionId)?.lastTurnNumber ?? 0;
}

/** Note conversational activity (interim transcript, agent speech) without allocating a turn. */
export function markSessionActivity(sessionId: string, now: number = Date.now()): void {
  getOrCreate(sessionId, now).lastActivityAt = now;
}

/** Time (ms epoch) of the last activity, or undefined if the session was never seen. */
export function getLastActivityAt(sessionId: string): number | undefined {
  return sequences.get(sessionId)?.lastActivityAt;
}

/** Forget a session (call at session end). */
export function resetTurnSequence(sessionId: string): void {
  sequences.delete(sessionId);
}

/** Test helper. */
export function clearAllTurnSequences(): void {
  sequences.clear();
}
