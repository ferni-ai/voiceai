/**
 * Superhuman Voice Session Management
 *
 * Tracks session state for superhuman voice enhancements.
 *
 * @module speech/adaptive-ssml/superhuman-voice/session
 */

import type { SuperhumanVoiceResult, SuperhumanVoiceSession } from './types.js';

// ============================================================================
// SESSION STORAGE
// ============================================================================

const sessions = new Map<string, SuperhumanVoiceSession>();

// ============================================================================
// SESSION FUNCTIONS
// ============================================================================

/**
 * Get or create session state for superhuman voice.
 */
export function getSuperhmanVoiceSession(sessionId: string): SuperhumanVoiceSession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      lastEmotion: null,
      enhancementHistory: [],
      turnCount: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Update session after applying enhancements.
 */
export function updateSuperhmanVoiceSession(
  sessionId: string,
  result: SuperhumanVoiceResult,
  currentEmotion?: string
): void {
  const session = getSuperhmanVoiceSession(sessionId);
  session.lastEmotion = currentEmotion || null;
  session.enhancementHistory.push(...result.appliedEnhancements);
  session.turnCount++;

  // Keep history manageable
  if (session.enhancementHistory.length > 50) {
    session.enhancementHistory = session.enhancementHistory.slice(-30);
  }
}

/**
 * Get the last emotion for a session (for transition bridges).
 */
export function getLastEmotion(sessionId: string): string | null {
  return sessions.get(sessionId)?.lastEmotion || null;
}

/**
 * Reset session state.
 */
export function resetSuperhmanVoiceSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Reset all sessions.
 */
export function resetAllSuperhmanVoiceSessions(): void {
  sessions.clear();
}

/**
 * Get active session count.
 */
export function getActiveSuperhmanVoiceSessionCount(): number {
  return sessions.size;
}
