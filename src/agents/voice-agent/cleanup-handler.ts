/**
 * Voice Agent Cleanup Handler
 *
 * Handles ALL cleanup on session disconnect. Extracted from voice-agent.ts
 * to reduce file size and improve maintainability.
 *
 * @module voice-agent/cleanup-handler
 */

import { log } from '@livekit/agents';
import { resetDJBooth } from '../../audio/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { onCognitiveSessionEnd } from '../../services/cognitive-session-hooks.js';
import { endConversation as endConversationState } from '../../services/conversation-state.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { onSessionEnd as saveTrustProfiles } from '../../services/trust-systems/index.js';
import { recordSessionEnd } from '../../services/voice-humanization-metrics.js';
import { recordSessionEnd as recordUserSessionEnd } from '../../services/user-analytics.js';
import { resetEnhancedTurnPredictor } from '../../speech/enhanced-turn-prediction.js';
import { resetFFTAnalyzer } from '../../speech/fft-analyzer.js';
import { resetMultiSignalLaughterDetector } from '../../speech/multi-signal-laughter.js';
import { resetResponseAnticipationService } from '../../speech/response-anticipation.js';
import { resetWordTimingRhythmService } from '../../speech/word-timing-rhythm.js';
import { resetHandoffState, resetMetPersonas } from '../../tools/handoff/index.js';
import { getDJIntegration } from '../dj-integration.js';
import {
  cleanupProsodyBridge,
  onSessionEnd as endHumanizationSession,
  persistOnSessionEnd as saveHumanizationState,
} from '../../conversation/humanization/index.js';
import {
  cleanupDynamicSpeed,
} from '../integrations/dynamic-speed-integration.js';
import {
  finalizeSpeechMetrics,
  logMetricsSummary,
} from '../integrations/speech-metrics-integration.js';
import { unregisterSessionTTS } from '../../api/session-accent-routes.js';
import {
  createFirestoreSuperhumanStore,
  saveSuperhumanData,
} from '../../services/superhuman-persistence.js';

// Better-than-human API services cleanup
import { clearEmotionalArc } from '../../intelligence/context-builders/advanced-voice-emotion.js';
import { clearSession as clearHumeSession } from '../../services/emotion-analysis/hume.js';

// Handoff event emitter for cleanup
import { handoffEvents } from '../../tools/handoff/index.js';

/**
 * Voice humanization integration interface for cleanup
 */
interface VoiceHumanizationCleanup {
  cleanup: () => void;
}

/**
 * User data with trial info
 */
interface UserDataWithTrial {
  turnCount?: number;
  isTrialUser?: boolean;
  isFirstConversation?: boolean;
}

/**
 * Cleanup context passed to the cleanup handler
 */
export interface CleanupContext {
  sessionId: string;
  userId?: string;
  services: SessionServices;
  sessionPersona: PersonaConfig;
  voiceHumanization: VoiceHumanizationCleanup | null;
  utilitiesCleanup?: () => Promise<void>;
  patternAnalyzer: { endSession: (sessionId: string) => void };
  autoOptimizer: { endSession: (sessionId: string) => void };
  feedbackCollector: { flush: () => Promise<void> };
  // Additional cleanup functions
  dataChannelCleanup?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handoffHandler?: (data: any) => void;
  cameoCleanup?: () => void;
  musicCleanup?: () => void;
  // User data for trial tracking
  userData?: UserDataWithTrial;
}

/**
 * Handle all cleanup tasks when a session disconnects.
 * Non-fatal - errors are logged but don't prevent other cleanup.
 */
export async function handleSessionCleanup(ctx: CleanupContext): Promise<void> {
  const {
    sessionId,
    userId,
    services,
    sessionPersona,
    voiceHumanization,
    utilitiesCleanup,
    patternAnalyzer,
    autoOptimizer,
    feedbackCollector,
    dataChannelCleanup,
    handoffHandler,
    cameoCleanup,
    musicCleanup,
    userData,
  } = ctx;

  try {
    // ================================================================
    // STEP 1: Remove event listeners to prevent memory leaks
    // ================================================================
    if (dataChannelCleanup) {
      dataChannelCleanup();
    }

    if (handoffHandler) {
      handoffEvents.off('voiceSwitch', handoffHandler);
    }

    if (cameoCleanup) {
      cameoCleanup();
    }

    // ================================================================
    // STEP 2: Clean up session-scoped state
    // ================================================================
    try {
      const { clearHandoffSessionState } = await import('../shared/handoff-handler.js');
      clearHandoffSessionState(sessionId);
      diag.session('Handoff session state cleaned up');
    } catch (handoffCleanupErr) {
      diag.warn('Handoff session state cleanup failed (non-fatal)', {
        error: String(handoffCleanupErr),
      });
    }

    try {
      const { resetSessionState } = await import('../../services/cameo/index.js');
      resetSessionState(sessionId);
      diag.session('Cameo session state cleaned up');
    } catch (cameoCleanupErr) {
      diag.warn('Cameo session state cleanup failed (non-fatal)', {
        error: String(cameoCleanupErr),
      });
    }

    // ================================================================
    // STEP 3: End conversation state and log final state
    // ================================================================
    const finalConvState = endConversationState(sessionId);
    if (finalConvState) {
      diag.session('Conversation state ended', {
        turnCount: finalConvState.flow.turnCount,
        durationMinutes: finalConvState.flow.durationMinutes,
        topicsDiscussed: finalConvState.topic.history.length,
        keyMoments: finalConvState.user.keyMoments.length,
        finalSentiment: finalConvState.emotional.sentiment,
      });
    }

    // ================================================================
    // STEP 4: End cognitive intelligence session
    // ================================================================
    await cleanupCognitiveSession(userId, sessionPersona.id, sessionId, services);

    // ================================================================
    // STEP 5: First Taste Trial - Record session time
    // ================================================================
    if (userData?.isTrialUser && userId) {
      try {
        const { recordTrialTime } = await import('../../services/first-taste-trial.js');
        const sessionDurationMs = Date.now() - services.sessionStartTime;
        await recordTrialTime(userId, sessionDurationMs);
        diag.session('Trial time recorded', {
          userId,
          sessionDurationMs,
          wasFirstConversation: userData.isFirstConversation,
        });
      } catch (trialErr) {
        diag.warn('Trial time recording failed (non-fatal)', { error: String(trialErr) });
      }
    }

    // ================================================================
    // STEP 6: DJ Integration - Save session summary
    // ================================================================
    await cleanupDJIntegration(services);

    // Music handler timers cleanup
    if (musicCleanup) {
      try {
        musicCleanup();
        diag.session('🎧 Music handler timers cleaned up');
      } catch (timerErr) {
        diag.warn('🎧 Music timer cleanup failed (non-fatal)', { error: String(timerErr) });
      }
    }

    // DJ Booth: Clean up audio orchestration
    cleanupDJBooth();

    // ================================================================
    // STEP 7: Voice Humanization - Clean up all services
    // ================================================================
    cleanupVoiceHumanization(voiceHumanization, sessionId);

    // Advanced voice humanization services
    try {
      recordSessionEnd(sessionId);

      // User Analytics: Record session end for DAU/WAU/MAU metrics
      void recordUserSessionEnd(sessionId, userData?.turnCount || 0, []).catch((err) =>
        diag.warn('📊 User analytics session end failed', { error: String(err) })
      );

      // Unregister TTS for accent changes
      unregisterSessionTTS(sessionId);

      // Reset all advanced services
      resetFFTAnalyzer(sessionId);
      resetEnhancedTurnPredictor(sessionId);
      resetMultiSignalLaughterDetector(sessionId);
      resetWordTimingRhythmService(sessionId);
      resetResponseAnticipationService(sessionId);

      // Finalize unified speech metrics and cleanup dynamic speed
      logMetricsSummary(sessionId);
      finalizeSpeechMetrics(sessionId, true);
      cleanupDynamicSpeed(sessionId);

      diag.session('🎤 Advanced voice humanization services cleaned up');
    } catch (advVhErr) {
      diag.warn('🎤 Advanced voice humanization cleanup failed (non-fatal)', {
        error: String(advVhErr),
      });
    }

    // ================================================================
    // STEP 8: Save trust profiles and superhuman intelligence
    // ================================================================
    if (userId) {
      await cleanupTrustProfiles(userId);

      // Save superhuman intelligence data
      try {
        const { getFirestoreStore } = await import('../../memory/firestore-store.js');
        const superhumanStore = createFirestoreSuperhumanStore(async () => {
          const store = getFirestoreStore();
          if (!store) throw new Error('Firestore not initialized');
          return store as unknown as {
            collection: (name: string) => {
              doc: (id: string) => {
                get: () => Promise<{ exists: boolean; data: () => unknown }>;
                set: (data: unknown, opts?: { merge?: boolean }) => Promise<void>;
                delete: () => Promise<void>;
              };
            };
          };
        });
        await saveSuperhumanData(userId, sessionId, superhumanStore);
        diag.session('🧠 Superhuman intelligence saved', { userId });
      } catch (superhumanErr) {
        diag.warn('Superhuman data save failed (non-fatal)', {
          error: String(superhumanErr),
        });
      }
    }

    // Save utility preferences and patterns
    if (utilitiesCleanup) {
      await cleanupUtilities(utilitiesCleanup);
    }

    // ================================================================
    // STEP 9: End session services
    // ================================================================
    await services.endSession();

    // Reset handoff state for next session
    resetHandoffState();
    resetMetPersonas();

    // ================================================================
    // STEP 10: Shutdown music and games
    // ================================================================
    await cleanupMusic();
    await cleanupGames();

    // ================================================================
    // STEP 11: Flush optimization data
    // ================================================================
    cleanupOptimization(sessionId, patternAnalyzer, autoOptimizer, feedbackCollector);

    // ================================================================
    // STEP 12: End identity session
    // ================================================================
    await cleanupIdentitySession(sessionId);

    // ================================================================
    // STEP 13: World awareness cleanup
    // ================================================================
    try {
      const { cleanupWorldAwareness } =
        await import('../../services/world-awareness/session-integration.js');
      cleanupWorldAwareness(userId || 'anonymous');
      diag.session('🌍 World awareness cleaned up');
    } catch (worldCleanupErr) {
      diag.debug('World awareness cleanup failed (non-fatal)', {
        error: String(worldCleanupErr),
      });
    }

    // ================================================================
    // STEP 14: Personal journey cleanup
    // ================================================================
    try {
      const { cleanupPersonalJourney } =
        await import('../../services/personal-journey/session-integration.js');
      cleanupPersonalJourney(userId || 'anonymous');
      diag.session('🌟 Personal journey cleaned up');
    } catch (journeyCleanupErr) {
      diag.debug('Personal journey cleanup failed (non-fatal)', {
        error: String(journeyCleanupErr),
      });
    }

    // ================================================================
    // STEP 15: Advanced humanization persistence
    // ================================================================
    try {
      endHumanizationSession(sessionId);

      // End analytics session
      const { humanizationAnalytics } =
        await import('../../conversation/humanization/analytics.js');
      const analyticsStats = humanizationAnalytics.endSession(sessionId);
      if (analyticsStats) {
        diag.session('📊 Humanization analytics', {
          totalHumanizations: analyticsStats.totalHumanizations,
          uniqueFeatures: analyticsStats.uniqueFeaturesUsed,
          avgBreathingSync: analyticsStats.avgBreathingSyncQuality.toFixed(2),
        });
      }

      // Persist humanization data to Firestore
      const saveResult = await saveHumanizationState(userId || 'anonymous', sessionId);
      if (saveResult.saved) {
        diag.session('🎭 Humanization state persisted', { items: saveResult.items });
      }

      // Cleanup prosody bridge
      cleanupProsodyBridge(sessionId);
    } catch (humanizationEndErr) {
      diag.warn('Humanization persistence failed (non-fatal)', {
        error: String(humanizationEndErr),
      });
    }

    // ================================================================
    // STEP 16: Human listening pipeline cleanup
    // ================================================================
    await cleanupHumanListening(sessionId);

    // ================================================================
    // STEP 17: Deep humanization cleanup
    // ================================================================
    await cleanupDeepHumanization(sessionId);

    // ================================================================
    // STEP 18: Advanced humanization cleanup
    // ================================================================
    try {
      const { cleanupAdvancedHumanizationSession } =
        await import('../processors/injection-builders.js');
      await cleanupAdvancedHumanizationSession(sessionId);
      diag.session('🌟 Advanced humanization session cleaned up');
    } catch (advHumanCleanupErr) {
      diag.warn('Advanced humanization cleanup failed (non-fatal)', {
        error: String(advHumanCleanupErr),
      });
    }

    // Better-than-human API services cleanup
    cleanupAdvancedEmotionServices(sessionId);

    diag.session('Session cleanup complete');
  } catch (error) {
    diag.error('Session cleanup error', { error: String(error) });
  }
}

// ============================================================================
// INDIVIDUAL CLEANUP FUNCTIONS
// ============================================================================

async function cleanupCognitiveSession(
  userId: string | undefined,
  personaId: string,
  sessionId: string,
  services: SessionServices
): Promise<void> {
  try {
    const cognitiveResult = await onCognitiveSessionEnd({
      userId: userId || 'anonymous',
      personaId,
      sessionId,
      sessionDurationMs: Date.now() - services.sessionStartTime,
    });
    if (cognitiveResult) {
      diag.session('Cognitive session ended', {
        approachesUsed: cognitiveResult.approachesUsed,
        topicsExplained: cognitiveResult.topicsExplained,
        userStyle: cognitiveResult.userStyle,
      });
    }
  } catch (cogError) {
    diag.warn('Cognitive session end failed (non-fatal)', { error: String(cogError) });
  }
}

async function cleanupDJIntegration(services: SessionServices): Promise<void> {
  try {
    const dj = getDJIntegration();
    const djSummary = dj.getSessionSummary();
    if (djSummary.musicArtists.length > 0 && services.userProfile) {
      // Update music memory for next session's "Remember when we listened to..."
      const existingMemory = services.userProfile.musicMemory;
      services.userProfile.musicMemory = {
        favoriteGenres: existingMemory?.favoriteGenres || [],
        dislikedArtists: existingMemory?.dislikedArtists || [],
        lastPlayedTrack: existingMemory?.lastPlayedTrack,
        preferredMusicTimes: existingMemory?.preferredMusicTimes,
        musicMoods: existingMemory?.musicMoods,
        updatedAt: new Date(),
        favoriteArtists: [
          ...new Set([...(existingMemory?.favoriteArtists || []), ...djSummary.musicArtists]),
        ].slice(-10), // Keep last 10 artists
        lastPlayedArtist: djSummary.musicArtists[djSummary.musicArtists.length - 1],
        totalTracksPlayed: (existingMemory?.totalTracksPlayed || 0) + djSummary.musicArtists.length,
      };
      diag.session('🎧 DJ session summary saved', {
        topics: djSummary.topics.length,
        artists: djSummary.musicArtists.length,
      });
    }
  } catch (djErr) {
    diag.warn('🎧 DJ summary save failed (non-fatal)', { error: String(djErr) });
  }
}

function cleanupDJBooth(): void {
  try {
    resetDJBooth();
    diag.session('🎧 DJ Booth cleaned up');
  } catch (boothErr) {
    diag.warn('🎧 DJ Booth cleanup failed (non-fatal)', { error: String(boothErr) });
  }
}

function cleanupVoiceHumanization(
  voiceHumanization: VoiceHumanizationCleanup | null,
  _sessionId: string
): void {
  // Basic voice humanization cleanup (advanced services handled in main function)
  if (voiceHumanization) {
    try {
      voiceHumanization.cleanup();
      diag.session('🎤 Voice humanization cleaned up');
    } catch (vhErr) {
      diag.warn('🎤 Voice humanization cleanup failed (non-fatal)', {
        error: String(vhErr),
      });
    }
  }
}

async function cleanupTrustProfiles(userId: string): Promise<void> {
  try {
    await saveTrustProfiles(userId);
    diag.session('Trust profiles saved', { userId });
  } catch (trustErr) {
    diag.warn('Trust profile save failed (non-fatal)', { error: String(trustErr) });
  }
}

async function cleanupUtilities(utilitiesCleanup: () => Promise<void>): Promise<void> {
  try {
    await utilitiesCleanup();
    diag.session('Utility patterns saved');
  } catch (utilErr) {
    diag.warn('Utility cleanup failed (non-fatal)', { error: String(utilErr) });
  }
}

async function cleanupMusic(): Promise<void> {
  try {
    const { isMusicEnabled } = await import('../../config/environment.js');
    if (isMusicEnabled()) {
      const { shutdownSpotify } = await import('../../tools/spotify.js');
      shutdownSpotify();
      const { resetMusicPlayer } = await import('../../audio/index.js');
      resetMusicPlayer();
      diag.session('Spotify and music player reset');
    }
  } catch (e) {
    log().debug({ error: String(e) }, 'Music cleanup failed (non-fatal)');
  }
}

async function cleanupGames(): Promise<void> {
  try {
    const { getGameEngine, resetGameEngine } = await import('../../services/games/index.js');
    const engine = getGameEngine();
    await engine.flushToStorage();
    resetGameEngine();
    diag.session('Game engine flushed and reset');
  } catch (e) {
    log().debug({ error: String(e) }, 'Game cleanup failed (non-fatal)');
  }
}

function cleanupOptimization(
  sessionId: string,
  patternAnalyzer: { endSession: (sessionId: string) => void },
  autoOptimizer: { endSession: (sessionId: string) => void },
  feedbackCollector: { flush: () => Promise<void> }
): void {
  try {
    patternAnalyzer.endSession(sessionId);
    autoOptimizer.endSession(sessionId);
    void feedbackCollector.flush();
    diag.session('Optimization data flushed');
  } catch (e) {
    log().debug({ error: String(e) }, 'Optimization flush failed (non-fatal)');
  }
}

async function cleanupIdentitySession(sessionId: string): Promise<void> {
  try {
    const { onSessionEnd } =
      await import('../../services/trust-and-identity/voice-agent-integration.js');
    await onSessionEnd(sessionId);
    diag.session('🔐 Identity session ended');
  } catch (identityEndErr) {
    diag.warn('Identity session end failed (non-fatal)', {
      error: String(identityEndErr),
    });
  }
}

async function cleanupHumanListening(sessionId: string): Promise<void> {
  try {
    const { clearHumanListeningResult } =
      await import('../../intelligence/context-builders/human-listening.js');
    clearHumanListeningResult(sessionId);

    const { resetHumanListeningPipeline } =
      await import('../../speech/human-listening-pipeline.js');
    resetHumanListeningPipeline(sessionId);
    diag.session('🎧 Human listening session cleaned up');
  } catch (listeningCleanupErr) {
    diag.warn('Human listening cleanup failed (non-fatal)', {
      error: String(listeningCleanupErr),
    });
  }
}

function cleanupAdvancedEmotionServices(sessionId: string): void {
  try {
    // Clear Hume AI session state
    clearHumeSession(sessionId);

    // Clear emotional arc tracking
    clearEmotionalArc(sessionId);

    diag.session('🦸 Better-than-human services cleaned up');
  } catch (emotionCleanupErr) {
    diag.warn('Advanced emotion cleanup failed (non-fatal)', {
      error: String(emotionCleanupErr),
    });
  }
}

async function cleanupDeepHumanization(sessionId: string): Promise<void> {
  try {
    const { cleanupDeepHumanization: cleanup } =
      await import('../../intelligence/context-builders/deep-humanization.js');
    cleanup(sessionId);
    diag.session('🎭 Deep humanization session cleaned up');
  } catch (deepHumanCleanupErr) {
    diag.warn('Deep humanization cleanup failed (non-fatal)', {
      error: String(deepHumanCleanupErr),
    });
  }
}

export default handleSessionCleanup;
