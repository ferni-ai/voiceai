/**
 * Speech Session Cleanup
 *
 * Unified cleanup function for all speech-related session state.
 * Call this when a voice session ends to prevent memory leaks.
 *
 * This consolidates cleanup across ALL 27+ session-scoped services:
 * - Audio prosody analyzers
 * - WPM trackers
 * - Backchanneling systems
 * - Cognitive speech state
 * - TTS context
 * - Pronunciation memory
 * - Voice humanization
 * - Human listening pipeline
 * - Enhanced turn prediction
 * - Emotional contagion
 * - Voice tremor detection
 * - Volume dynamics
 * - Energy dynamics
 * - Fluency analysis
 * - Filler analysis
 * - FFT analyzer
 * - Multi-signal laughter
 * - Word timing rhythm
 * - Response anticipation
 * - Ambient awareness
 * - Breath detection
 * - Realtime preemptive processor
 * - Cartesia context
 * - Session voice manager
 */

import { getLogger } from '../utils/safe-logger.js';

// Core speech services
import { removeSessionAudioProsodyAnalyzer } from './audio-prosody.js';
import { removeSessionBackchannelingSystem } from './backchanneling.js';
import { clearSessionContextId } from './cartesia-context-patch.js';
import { clearCognitiveSpeechState } from './cognitive-speech-integration.js';
import { resetPronunciationMemory } from './pronunciation-memory.js';
import { removeSessionWPMTracker } from './speech-context.js';
import { getTtsContextService } from './tts-context.js';

// Human listening & analysis services
import { resetEmotionalContagion } from './emotional-contagion.js';
import { resetEnhancedTurnPredictor } from './enhanced-turn-prediction.js';
import { resetHumanListeningPipeline } from './human-listening-pipeline.js';
import { resetVoiceHumanization } from './voice-humanization.js';

// Audio analysis services
import { resetBreathDetector } from './breath-detection.js';
import { resetEnergyDynamicsTracker } from './energy-dynamics.js';
import { resetFFTAnalyzer } from './fft-analyzer.js';
import { resetFillerAnalyzer } from './filler-analysis.js';
import { resetFluencyAnalyzer } from './fluency-analysis.js';
import { resetMultiSignalLaughterDetector } from './multi-signal-laughter.js';
import { resetVoiceTremorDetector } from './voice-tremor.js';
import { resetVolumeDynamicsTracker } from './volume-dynamics.js';

// Timing & rhythm services
import { resetResponseAnticipationService } from './response-anticipation.js';
import { resetWordTimingRhythmService } from './word-timing-rhythm.js';

// Context & environment services
import { resetAmbientAwareness } from './ambient-awareness.js';
import { resetRealtimePreemptiveProcessor } from './realtime-preemptive-patch.js';

// Voice manager
import { resetSessionVoiceManager } from './voice-manager.js';

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

  // Helper to safely run cleanup with error handling
  const safeCleanup = (name: string, fn: () => void): void => {
    try {
      fn();
      cleanupResults[name] = true;
    } catch (error) {
      cleanupResults[name] = false;
      log.warn({ sessionId, error: String(error) }, `Failed to cleanup ${name}`);
    }
  };

  // ============================================================================
  // CORE SPEECH SERVICES
  // ============================================================================

  safeCleanup('audioProsody', () => removeSessionAudioProsodyAnalyzer(sessionId));
  safeCleanup('wpmTracker', () => removeSessionWPMTracker(sessionId));
  safeCleanup('backchanneling', () => removeSessionBackchannelingSystem(sessionId));
  safeCleanup('cognitiveSpeech', () => clearCognitiveSpeechState(sessionId));
  safeCleanup('ttsContext', () => getTtsContextService().clearSession(sessionId));
  safeCleanup('pronunciationMemory', () => resetPronunciationMemory(sessionId));
  safeCleanup('cartesiaContext', () => clearSessionContextId(sessionId));

  // ============================================================================
  // HUMAN LISTENING & ANALYSIS SERVICES
  // ============================================================================

  safeCleanup('humanListening', () => resetHumanListeningPipeline(sessionId));
  safeCleanup('voiceHumanization', () => resetVoiceHumanization(sessionId));
  safeCleanup('turnPrediction', () => resetEnhancedTurnPredictor(sessionId));
  safeCleanup('emotionalContagion', () => resetEmotionalContagion(sessionId));

  // ============================================================================
  // AUDIO ANALYSIS SERVICES
  // ============================================================================

  safeCleanup('voiceTremor', () => resetVoiceTremorDetector(sessionId));
  safeCleanup('volumeDynamics', () => resetVolumeDynamicsTracker(sessionId));
  safeCleanup('energyDynamics', () => resetEnergyDynamicsTracker(sessionId));
  safeCleanup('fluencyAnalyzer', () => resetFluencyAnalyzer(sessionId));
  safeCleanup('fillerAnalyzer', () => resetFillerAnalyzer(sessionId));
  safeCleanup('fftAnalyzer', () => resetFFTAnalyzer(sessionId));
  safeCleanup('laughterDetector', () => resetMultiSignalLaughterDetector(sessionId));
  safeCleanup('breathDetector', () => resetBreathDetector(sessionId));

  // ============================================================================
  // TIMING & RHYTHM SERVICES
  // ============================================================================

  safeCleanup('wordTiming', () => resetWordTimingRhythmService(sessionId));
  safeCleanup('responseAnticipation', () => resetResponseAnticipationService(sessionId));

  // ============================================================================
  // CONTEXT & ENVIRONMENT SERVICES
  // ============================================================================

  safeCleanup('ambientAwareness', () => resetAmbientAwareness(sessionId));
  safeCleanup('realtimePreemptive', () => resetRealtimePreemptiveProcessor(sessionId));

  // ============================================================================
  // VOICE MANAGER (Session-Scoped)
  // ============================================================================

  safeCleanup('voiceManager', () => resetSessionVoiceManager(sessionId));

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
