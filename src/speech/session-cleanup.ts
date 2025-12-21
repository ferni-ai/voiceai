/**
 * Speech Session Cleanup
 *
 * Unified cleanup function for all speech-related session state.
 * Call this when a voice session ends to prevent memory leaks.
 *
 * This consolidates cleanup across ALL 35+ session-scoped services:
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
 * - Conversation momentum tracker
 * - Mid-response tangent state
 * - Self-awareness feedback loop
 * - Sesame-inspired: anticipatory prosody
 * - Sesame-inspired: micro-reactions
 * - Sesame-inspired: conversation prosody
 * - Sesame-inspired: rich disfluencies
 */

import { getLogger } from '../utils/safe-logger.js';

// Core speech services (using preferred reset* naming)
import { resetSessionAudioProsodyAnalyzer } from './audio-prosody.js';
import { resetSessionBackchannelingSystem } from './backchanneling.js';
import { clearSessionContextId } from './cartesia-context-patch.js';
import { clearCognitiveSpeechState } from './cognitive-speech-integration.js';
import { resetPronunciationMemory } from './pronunciation-memory.js';
import { resetSessionWPMTracker } from './speech-context.js';
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

// Enhanced backchanneling (legacy, using preferred reset* naming)
import { resetEnhancedBackchannelingEngine } from './enhanced-backchanneling.js';

// Catchphrase tracking
import { resetSessionCatchphraseTracker } from './response-naturalness.js';

// Feedback coordination (global budget to prevent over-feedback)
import { resetFeedbackCoordinator } from './feedback-coordinator.js';

// Unified backchanneling
import { resetBackchanneling } from './backchanneling/index.js';

// Live backchanneling (real-time during user speech)
import { resetLiveBackchanneling } from './live-backchanneling/index.js';

// Conversation awareness trackers
import { resetTangentState } from '../conversation/mid-response-tangents.js';
import { resetMomentumTracker } from '../conversation/momentum-tracker.js';
import { resetSelfAwarenessTracker } from '../conversation/self-awareness-loop.js';

// Sesame-inspired prosody (state-of-the-art expressiveness)
import {
  resetAnticipatorySession,
  resetConversationState,
  resetDisfluencySession,
  resetMicroReactionSession,
  resetSesamePipeline,
} from './sesame-inspired/index.js';

// Superhuman voice (Better Than Human enhancements)
import { resetSuperhmanVoiceSession } from './adaptive-ssml/superhuman-voice.js';

// Active presence (quality over quantity presence markers)
import { resetActivePresenceSession } from './adaptive-ssml/active-presence.js';

// Speech orchestrator (unified coordination layer)
import { resetOrchestrator } from './orchestrator/index.js';

// Unified anticipation pipeline
import { resetAnticipationPipeline } from './anticipation/index.js';

// Graceful interrupt handling
import { resetInterruptState } from './graceful-interrupt/index.js';

// TTS Bulkhead (session isolation for voice synthesis)
import { cleanupTTSSession } from './tts-bulkhead.js';

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

  safeCleanup('audioProsody', () => resetSessionAudioProsodyAnalyzer(sessionId));
  safeCleanup('wpmTracker', () => resetSessionWPMTracker(sessionId));
  safeCleanup('backchanneling', () => resetSessionBackchannelingSystem(sessionId));
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

  // ============================================================================
  // BACKCHANNELING (Unified + Legacy + Live)
  // ============================================================================

  safeCleanup('unifiedBackchanneling', () => resetBackchanneling(sessionId));
  safeCleanup('enhancedBackchanneling', () => resetEnhancedBackchannelingEngine(sessionId));
  safeCleanup('liveBackchanneling', () => resetLiveBackchanneling(sessionId));
  safeCleanup('catchphraseTracker', () => resetSessionCatchphraseTracker(sessionId));
  safeCleanup('feedbackCoordinator', () => resetFeedbackCoordinator(sessionId));

  // ============================================================================
  // CONVERSATION AWARENESS TRACKERS
  // ============================================================================

  safeCleanup('momentumTracker', () => resetMomentumTracker(sessionId));
  safeCleanup('tangentState', () => resetTangentState(sessionId));
  safeCleanup('selfAwareness', () => resetSelfAwarenessTracker(sessionId));

  // ============================================================================
  // SESAME-INSPIRED PROSODY (State-of-the-art expressiveness)
  // ============================================================================

  safeCleanup('anticipatoryProsody', () => resetAnticipatorySession(sessionId));
  safeCleanup('microReactions', () => resetMicroReactionSession(sessionId));
  safeCleanup('conversationProsody', () => resetConversationState(sessionId));
  safeCleanup('richDisfluencies', () => resetDisfluencySession(sessionId));
  safeCleanup('sesamePipeline', () => resetSesamePipeline(sessionId));

  // ============================================================================
  // SUPERHUMAN VOICE (Better Than Human enhancements)
  // ============================================================================

  safeCleanup('superhumanVoice', () => resetSuperhmanVoiceSession(sessionId));

  // ============================================================================
  // ACTIVE PRESENCE (Quality over quantity presence markers)
  // ============================================================================

  safeCleanup('activePresence', () => resetActivePresenceSession(sessionId));

  // ============================================================================
  // SPEECH ORCHESTRATOR (Unified coordination layer)
  // ============================================================================

  safeCleanup('orchestrator', () => resetOrchestrator(sessionId));

  // ============================================================================
  // UNIFIED ANTICIPATION PIPELINE
  // ============================================================================

  safeCleanup('anticipationPipeline', () => resetAnticipationPipeline(sessionId));

  // ============================================================================
  // GRACEFUL INTERRUPT (Natural interrupt handling)
  // ============================================================================

  safeCleanup('gracefulInterrupt', () => resetInterruptState(sessionId));

  // ============================================================================
  // TTS BULKHEAD (Session isolation for voice synthesis)
  // ============================================================================

  safeCleanup('ttsBulkhead', () => cleanupTTSSession(sessionId));

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
 * Emergency cleanup - clears ALL state from ALL services.
 * Use only for emergency recovery or testing.
 *
 * This properly clears all internal Maps to prevent memory leaks.
 * Returns a promise that resolves when cleanup is complete.
 */
export async function emergencySpeechCleanup(): Promise<void> {
  log.warn('⚠️ Emergency speech cleanup initiated - clearing all service state');

  const clearResults: Record<string, boolean> = {};

  // Helper to safely run async clear-all with error handling
  const safeClearAll = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      clearResults[name] = true;
    } catch (error) {
      clearResults[name] = false;
      log.error({ error: String(error) }, `Failed to clear ${name}`);
    }
  };

  // Import and call reset-all functions dynamically to avoid circular deps
  // Note: These functions clear ALL instances, not just specific sessions
  // All cleanups are properly awaited to ensure completion
  await Promise.all([
    safeClearAll('audioProsody', async () => {
      const m = await import('./audio-prosody.js');
      if ('resetAllAudioProsodyAnalyzers' in m) {
        (m as { resetAllAudioProsodyAnalyzers: () => void }).resetAllAudioProsodyAnalyzers();
      }
    }),

    safeClearAll('humanListening', async () => {
      const m = await import('./human-listening-pipeline.js');
      m.resetAllHumanListeningPipelines();
    }),

    safeClearAll('voiceHumanization', async () => {
      const m = await import('./voice-humanization.js');
      m.resetAllVoiceHumanization();
    }),

    safeClearAll('emotionalContagion', async () => {
      const m = await import('./emotional-contagion.js');
      m.resetAllEmotionalContagion();
    }),

    safeClearAll('voiceTremor', async () => {
      const m = await import('./voice-tremor.js');
      m.resetAllVoiceTremorDetectors();
    }),

    safeClearAll('volumeDynamics', async () => {
      const m = await import('./volume-dynamics.js');
      m.resetAllVolumeDynamicsTrackers();
    }),

    safeClearAll('energyDynamics', async () => {
      const m = await import('./energy-dynamics.js');
      m.resetAllEnergyDynamicsTrackers();
    }),

    safeClearAll('fluencyAnalyzer', async () => {
      const m = await import('./fluency-analysis.js');
      m.resetAllFluencyAnalyzers();
    }),

    safeClearAll('fillerAnalyzer', async () => {
      const m = await import('./filler-analysis.js');
      m.resetAllFillerAnalyzers();
    }),

    safeClearAll('breathDetector', async () => {
      const m = await import('./breath-detection.js');
      m.resetAllBreathDetectors();
    }),

    safeClearAll('voiceManager', async () => {
      const m = await import('./voice-manager.js');
      m.resetAllSessionVoiceManagers();
    }),

    safeClearAll('backchanneling', async () => {
      const m = await import('./backchanneling/index.js');
      m.resetAllBackchanneling();
    }),

    safeClearAll('catchphraseTracker', async () => {
      const m = await import('./response-naturalness.js');
      m.resetAllCatchphraseTrackers();
    }),

    safeClearAll('cartesiaContexts', async () => {
      const m = await import('./cartesia-context-patch.js');
      m.clearAllContexts();
    }),

    safeClearAll('orchestrators', async () => {
      const m = await import('./orchestrator/index.js');
      m.resetAllOrchestrators();
    }),

    safeClearAll('anticipationPipelines', async () => {
      const m = await import('./anticipation/index.js');
      m.resetAllAnticipationPipelines();
    }),
  ]);

  // Clear session registry
  activeSessions.clear();

  const successCount = Object.values(clearResults).filter(Boolean).length;
  const totalCount = Object.keys(clearResults).length;

  log.warn(
    { successCount, totalCount },
    `⚠️ Emergency speech cleanup complete (${successCount}/${totalCount} services cleared)`
  );
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
