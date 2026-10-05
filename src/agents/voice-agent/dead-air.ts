/**
 * When a dead-air check-in may speak.
 *
 * The early check-in fires a few seconds after the user stops talking. Its
 * other guards miss a reply that is still being generated (agent "thinking",
 * no audio yet), so on a slow turn it started a second reply that cut the
 * real one off with "you still there?" (live dev call, 2026-09-27). The
 * session's own state is authoritative: only speak into real silence.
 *
 * @module agents/voice-agent/dead-air
 */

export interface SessionStates {
  agentState?: string;
  userState?: string;
}

export function isRealSilence(session: SessionStates | null | undefined): boolean {
  if (!session) return true; // no state to consult; defer to the other guards
  const agentBusy = session.agentState !== undefined && session.agentState !== 'listening';
  const userTalking = session.userState === 'speaking';
  return !agentBusy && !userTalking;
}

/**
 * The check-in delay, jittered ±25% so it never feels metronomic. The
 * caller gates on this same value: gating on the unjittered wait silently
 * dropped every check-in whose jitter came out early (about 43% of them).
 */
export function checkInDelay(baseMs: number, random: () => number = Math.random): number {
  return Math.round(baseMs * (0.75 + random() * 0.5));
}
