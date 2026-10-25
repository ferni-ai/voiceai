/**
 * Sessions whose live backchannels play as recorded clips (startTurnSounds in
 * live-call-behaviors.ts). The older spoken path in session-state-handler.ts stays
 * quiet for them: it had no gate of its own, so a caller could hear a clip "mm-hm"
 * and a spoken "yep" seconds apart (dev 2026-10-21..23: 13 of 15 spoken ones landed
 * within 6 s of a clip on the same pod).
 */
const clipSessions = new Set<string>();

/** Marks a session as playing clip backchannels; returns the cleanup that unmarks it. */
export function noteUsesClips(sessionId: string): () => void {
  clipSessions.add(sessionId);
  return () => {
    clipSessions.delete(sessionId);
  };
}

/** True while the session's backchannels play as clips. */
export function usesClips(sessionId: string): boolean {
  return clipSessions.has(sessionId);
}
