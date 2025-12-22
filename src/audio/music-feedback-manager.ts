/**
 * Music Feedback Manager
 *
 * Singleton manager for recording music transition feedback.
 * This allows the feedback recording function to be set by the music handler
 * and called from anywhere (e.g., transcript handler).
 *
 * Why a singleton? Because the music handler creates the feedback function
 * in a closure, but the transcript handler (in a different file) needs to
 * call it when the user speaks after music ends.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'MusicFeedbackManager' });

// ============================================================================
// TYPES
// ============================================================================

export interface MusicFeedback {
  /** What the user said after the music transition */
  userResponse?: string;
  /** Whether the response seemed positive (detected or explicit) */
  wasPositive?: boolean;
  /** Voice tone analysis */
  voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
  /** Whether user continued the session */
  continuedSession?: boolean;
  /** Time in ms since music ended */
  timeSinceTransitionMs?: number;
}

export type MusicFeedbackRecorder = (feedback: MusicFeedback) => void;

// ============================================================================
// SINGLETON STATE
// ============================================================================

let currentFeedbackRecorder: MusicFeedbackRecorder | null = null;
let lastMusicEndedTimestamp: number | null = null;
let lastSessionId: string | null = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Register the feedback recorder for the current session
 * Called by setupMusicHandler when music handler is initialized
 */
export function registerMusicFeedbackRecorder(
  sessionId: string,
  recorder: MusicFeedbackRecorder
): void {
  currentFeedbackRecorder = recorder;
  lastSessionId = sessionId;
  log.debug({ sessionId }, '📊 Music feedback recorder registered');
}

/**
 * Mark that music has ended (call when transition happens)
 * This starts the window for feedback recording
 */
export function markMusicEnded(): void {
  lastMusicEndedTimestamp = Date.now();
  log.debug({ timestamp: lastMusicEndedTimestamp }, '📊 Music ended timestamp marked');
}

/**
 * Record feedback for the last music transition
 * Call this when user speaks to update per-user learning
 *
 * @param feedback - The feedback signals
 * @param sessionId - Session ID to verify correct session
 * @returns Whether feedback was recorded
 */
export function recordMusicFeedback(feedback: MusicFeedback, sessionId?: string): boolean {
  // Verify correct session
  if (sessionId && lastSessionId && sessionId !== lastSessionId) {
    log.debug({ sessionId, lastSessionId }, '📊 Session mismatch, skipping feedback');
    return false;
  }

  // No recorder available
  if (!currentFeedbackRecorder) {
    log.debug('📊 No feedback recorder available');
    return false;
  }

  // No recent music ending
  if (!lastMusicEndedTimestamp) {
    log.debug('📊 No recent music ending to record feedback for');
    return false;
  }

  // Check if within feedback window (2 minutes)
  const timeSinceTransition = Date.now() - lastMusicEndedTimestamp;
  if (timeSinceTransition > 2 * 60 * 1000) {
    log.debug({ ageMs: timeSinceTransition }, '📊 Music transition too old for feedback');
    return false;
  }

  // Record the feedback
  try {
    currentFeedbackRecorder({
      ...feedback,
      timeSinceTransitionMs: timeSinceTransition,
    });

    // Clear timestamp to prevent duplicate recording
    lastMusicEndedTimestamp = null;

    return true;
  } catch (e) {
    log.warn({ error: String(e) }, '📊 Failed to record music feedback');
    return false;
  }
}

/**
 * Check if there's a recent music transition to provide feedback on
 */
export function hasPendingMusicFeedback(): boolean {
  if (!lastMusicEndedTimestamp || !currentFeedbackRecorder) {
    return false;
  }

  const timeSinceTransition = Date.now() - lastMusicEndedTimestamp;
  return timeSinceTransition < 2 * 60 * 1000;
}

/**
 * Clear the feedback recorder (call on session end)
 */
export function clearMusicFeedbackRecorder(sessionId?: string): void {
  if (sessionId && lastSessionId && sessionId !== lastSessionId) {
    return; // Don't clear if session doesn't match
  }

  currentFeedbackRecorder = null;
  lastMusicEndedTimestamp = null;
  lastSessionId = null;
  log.debug('📊 Music feedback recorder cleared');
}

/**
 * Auto-detect feedback signals from user response
 *
 * @param userResponse - What the user said
 * @returns Detected feedback signals
 */
export function detectFeedbackFromResponse(userResponse: string): Partial<MusicFeedback> {
  const response = userResponse.toLowerCase();
  const feedback: Partial<MusicFeedback> = {
    userResponse,
    continuedSession: true,
  };

  // Detect positive signals
  const positivePatterns = [
    /thank(s| you)/,
    /that (was |felt )?(nice|good|great|lovely|perfect)/,
    /i (feel|felt) (better|calmer|more relaxed|good)/,
    /that helped/,
    /beautiful/,
    /love(d)? (that|it|the music)/,
    /needed that/,
  ];

  for (const pattern of positivePatterns) {
    if (pattern.test(response)) {
      feedback.wasPositive = true;
      break;
    }
  }

  // Detect negative signals
  const negativePatterns = [
    /not (really |what i |helping)/,
    /don't like/,
    /stop/,
    /too (loud|quiet|much)/,
    /annoying/,
    /weird/,
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(response)) {
      feedback.wasPositive = false;
      break;
    }
  }

  // If no explicit signal, leave wasPositive undefined
  // (the recorder will use other signals like voice tone)

  return feedback;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerMusicFeedbackRecorder,
  markMusicEnded,
  recordMusicFeedback,
  hasPendingMusicFeedback,
  clearMusicFeedbackRecorder,
  detectFeedbackFromResponse,
};
