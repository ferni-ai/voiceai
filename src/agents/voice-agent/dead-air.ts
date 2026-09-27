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
