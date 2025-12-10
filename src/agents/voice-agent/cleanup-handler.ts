/**
 * Voice Agent Cleanup Handler
 *
 * Handles cleanup on session disconnect. Extracted from voice-agent.ts
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
import { resetEnhancedTurnPredictor } from '../../speech/enhanced-turn-prediction.js';
import { resetFFTAnalyzer } from '../../speech/fft-analyzer.js';
import { resetMultiSignalLaughterDetector } from '../../speech/multi-signal-laughter.js';
import { resetResponseAnticipationService } from '../../speech/response-anticipation.js';
import { resetWordTimingRhythmService } from '../../speech/word-timing-rhythm.js';
import { resetHandoffState, resetMetPersonas } from '../../tools/handoff/index.js';
import { getDJIntegration } from '../dj-integration.js';

// Better-than-human API services cleanup
import { clearEmotionalArc } from '../../intelligence/context-builders/advanced-voice-emotion.js';
import { clearSession as clearHumeSession } from '../../services/emotion-analysis/hume.js';

/**
 * Voice humanization integration interface for cleanup
 */
interface VoiceHumanizationCleanup {
  cleanup: () => void;
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
  } = ctx;

  try {
    // End conversation state and get final state for logging
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

    // End cognitive intelligence session and save learnings
    await cleanupCognitiveSession(userId, sessionPersona.id, sessionId, services);

    // DJ Integration: Save session summary for cross-session callbacks
    await cleanupDJIntegration(services);

    // DJ Booth: Clean up audio orchestration
    cleanupDJBooth();

    // Voice Humanization: Clean up session-specific state
    cleanupVoiceHumanization(voiceHumanization, sessionId);

    // Save trust profiles (boundaries, growth, callbacks, etc.)
    if (userId) {
      await cleanupTrustProfiles(userId);
    }

    // Save utility preferences and patterns (timers, tips, timezones, etc.)
    if (utilitiesCleanup) {
      await cleanupUtilities(utilitiesCleanup);
    }

    // End session services
    await services.endSession();

    // Reset handoff state for next session
    resetHandoffState();
    resetMetPersonas();

    // Shutdown Spotify and music player
    await cleanupMusic();

    // Flush game memory to storage
    await cleanupGames();

    // Flush optimization data (patterns, feedback)
    cleanupOptimization(sessionId, patternAnalyzer, autoOptimizer, feedbackCollector);

    // End identity session
    await cleanupIdentitySession(sessionId);

    // Human listening pipeline cleanup
    await cleanupHumanListening(sessionId);

    // Better-than-human API services cleanup
    cleanupAdvancedEmotionServices(sessionId);

    // Deep humanization cleanup (arc awareness, monologue, story tracking)
    await cleanupDeepHumanization(sessionId);

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
  sessionId: string
): void {
  // Basic voice humanization cleanup
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

  // Advanced voice humanization services cleanup
  try {
    recordSessionEnd(sessionId);
    resetFFTAnalyzer(sessionId);
    resetEnhancedTurnPredictor(sessionId);
    resetMultiSignalLaughterDetector(sessionId);
    resetWordTimingRhythmService(sessionId);
    resetResponseAnticipationService(sessionId);
    diag.session('🎤 Advanced voice humanization services cleaned up');
  } catch (advVhErr) {
    diag.warn('🎤 Advanced voice humanization cleanup failed (non-fatal)', {
      error: String(advVhErr),
    });
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
