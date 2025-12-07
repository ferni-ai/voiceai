/**
 * Speech Session Cleanup
 *
 * Unified cleanup function for all speech-related session state.
 * Call this when a voice session ends to prevent memory leaks.
 *
 * This consolidates cleanup across:
 * - Audio prosody analyzers
 * - WPM trackers
 * - Backchanneling systems
 * - Cognitive speech state
 * - TTS context
 * - Pronunciation memory
 * - Live backchanneling
 */

import { getLogger } from '../utils/safe-logger.js';
import { removeSessionAudioProsodyAnalyzer } from './audio-prosody.js';
import { removeSessionWPMTracker } from './speech-context.js';
import { removeSessionBackchannelingSystem } from './backchanneling.js';
import { clearCognitiveSpeechState } from './cognitive-speech-integration.js';
import { getTtsContextService } from './tts-context.js';
import { resetPronunciationMemory } from './pronunciation-memory.js';
import { clearSessionContextId } from './cartesia-context-patch.js';

const log = getLogger().child({ module: 'SpeechSessionCleanup' });

// ============================================================================
// SESSION REGISTRY
// ============================================================================

/**
 * Track active sessions for debugging and monitoring
 */
const activeSessions = new Set<string>();

/**
 * Register a new speech session
 */
export function registerSpeechSession(sessionId: string): void {
  activeSessions.add(sessionId);
  log.debug({ sessionId, activeSessions: activeSessions.size }, 'Speech session registered');
}

/**
 * Get count of active speech sessions
 */
export function getActiveSpeechSessionCount(): number {
  return activeSessions.size;
}

/**
 * Get all active session IDs (for debugging)
 */
export function getActiveSpeechSessions(): string[] {
  return [...activeSessions];
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Clean up all speech-related state for a session.
 *
 * Call this when:
 * - A voice session ends normally
 * - A session disconnects unexpectedly
 * - A session times out
 *
 * @param sessionId - The session ID to clean up
 * @param options - Cleanup options
 */
export function cleanupSpeechSession(
  sessionId: string,
  options: {
    /** Log cleanup details (default: true) */
    verbose?: boolean;
    /** Reason for cleanup (for logging) */
    reason?: 'normal' | 'disconnect' | 'timeout' | 'error';
  } = {}
): void {
  const { verbose = true, reason = 'normal' } = options;
  const startTime = Date.now();

  if (verbose) {
    log.info({ sessionId, reason }, '🧹 Starting speech session cleanup');
  }

  const cleanupResults: Record<string, boolean> = {};

  // 1. Audio prosody analyzer
  try {
    removeSessionAudioProsodyAnalyzer(sessionId);
    cleanupResults['audioProsody'] = true;
  } catch (error) {
    cleanupResults['audioProsody'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to cleanup audio prosody analyzer');
  }

  // 2. WPM tracker
  try {
    removeSessionWPMTracker(sessionId);
    cleanupResults['wpmTracker'] = true;
  } catch (error) {
    cleanupResults['wpmTracker'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to cleanup WPM tracker');
  }

  // 3. Backchanneling system
  try {
    removeSessionBackchannelingSystem(sessionId);
    cleanupResults['backchanneling'] = true;
  } catch (error) {
    cleanupResults['backchanneling'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to cleanup backchanneling system');
  }

  // 4. Cognitive speech state
  try {
    clearCognitiveSpeechState(sessionId);
    cleanupResults['cognitiveSpeech'] = true;
  } catch (error) {
    cleanupResults['cognitiveSpeech'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to cleanup cognitive speech state');
  }

  // 5. TTS context
  try {
    getTtsContextService().clearSession(sessionId);
    cleanupResults['ttsContext'] = true;
  } catch (error) {
    cleanupResults['ttsContext'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to cleanup TTS context');
  }

  // 6. Pronunciation memory
  try {
    resetPronunciationMemory(sessionId);
    cleanupResults['pronunciationMemory'] = true;
  } catch (error) {
    cleanupResults['pronunciationMemory'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to cleanup pronunciation memory');
  }

  // 7. Cartesia context ID (if this session was using it)
  try {
    // Only clear if this session was the one using the context
    clearSessionContextId();
    cleanupResults['cartesiaContext'] = true;
  } catch (error) {
    cleanupResults['cartesiaContext'] = false;
    log.warn({ sessionId, error: String(error) }, 'Failed to clear Cartesia context ID');
  }

  // Remove from active sessions
  activeSessions.delete(sessionId);

  const durationMs = Date.now() - startTime;
  const successCount = Object.values(cleanupResults).filter(Boolean).length;
  const totalCount = Object.keys(cleanupResults).length;

  if (verbose) {
    log.info(
      {
        sessionId,
        reason,
        durationMs,
        successCount,
        totalCount,
        cleanupResults,
        remainingSessions: activeSessions.size,
      },
      `🧹 Speech session cleanup complete (${successCount}/${totalCount} services)`
    );
  }
}

/**
 * Clean up all speech sessions.
 * Use with caution - typically only for shutdown or testing.
 */
export function cleanupAllSpeechSessions(reason: 'shutdown' | 'test' = 'shutdown'): void {
  log.info({ sessionCount: activeSessions.size, reason }, '🧹 Cleaning up ALL speech sessions');

  const sessions = [...activeSessions];
  for (const sessionId of sessions) {
    cleanupSpeechSession(sessionId, { verbose: false, reason: 'normal' });
  }

  log.info({ cleanedCount: sessions.length }, '🧹 All speech sessions cleaned up');
}

/**
 * Emergency cleanup - clears all state without session tracking.
 * Use only for emergency recovery or testing.
 */
export function emergencySpeechCleanup(): void {
  log.warn('⚠️ Emergency speech cleanup initiated');

  // Clear session registry
  activeSessions.clear();

  // Note: This doesn't clean individual sessions, but clears the tracking.
  // Individual service Maps will need their own clear-all functions if needed.

  log.warn('⚠️ Emergency speech cleanup complete - session tracking cleared');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  cleanupSpeechSession,
  cleanupAllSpeechSessions,
  emergencySpeechCleanup,
  registerSpeechSession,
  getActiveSpeechSessionCount,
  getActiveSpeechSessions,
};
