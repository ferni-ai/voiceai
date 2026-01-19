/**
 * Session End Cleanup Module
 *
 * Handles cleanup operations at session end:
 * - Core component cleanup (history, context, learning engines)
 * - Intelligence engine cleanup
 * - Growth snapshot capture
 * - Cache clearing
 * - Realtime memory finalization
 * - Trust persistence flush
 * - Memory indexing
 * - Outreach analysis
 *
 * @module session-manager/session-end-cleanup
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { SessionServices } from '../types.js';
import type { ConversationTurn } from '../../memory/index.js';
import type { ConversationSummary } from './summarization.js';
import {
  removeHistoryTracker,
  clearCurrentSessionMomentsGetter,
} from '../../memory/index.js';
import { removeContextManager } from '../../context/index.js';
import {
  resetLearningEngine,
  removeResponseQualityTracker,
  removeConversationPatternAnalyzer,
  removeProactiveInsightEngine,
  removeFinancialJourneyTracker,
  removeCrossSessionThreader,
  removeVoicePaceAdapter,
  removeHumorCalibration,
  removeStoryPreference,
  removeCommunicationMirroring,
  removeEmotionalMemory,
} from '../../intelligence/index.js';
import { cleanupIntelligenceEngines } from '../intelligence-persistence.js';
import { onSessionEndUnified } from '../trust-systems/unified-persistence.js';
import * as realtimeMemory from '../memory/realtime-memory.js';

const log = getLogger();

// ============================================================================
// CORE COMPONENT CLEANUP
// ============================================================================

/**
 * Clean up core session components.
 */
export async function cleanupCoreComponents(sessionId: string): Promise<void> {
  removeHistoryTracker(sessionId);
  removeContextManager(sessionId);
  resetLearningEngine();
  clearCurrentSessionMomentsGetter();

  // Reset task manager
  try {
    const { resetTaskManager } = await import('../../tasks/task-manager.js');
    resetTaskManager();
  } catch {
    // Task manager may not be loaded
  }

  // 🚀 PERFORMANCE: Cleanup session optimizations (memory cache, prefetch state)
  try {
    const { cleanupSessionOptimizations } =
      await import('../../agents/shared/performance/session-optimizations.js');
    cleanupSessionOptimizations(sessionId);
  } catch {
    // Module may not be loaded - non-critical
  }

  // 🚀 PERFORMANCE: Cleanup tool response cache
  try {
    const { clearSessionToolCache } = await import('../performance/tool-response-cache.js');
    clearSessionToolCache(sessionId);
  } catch {
    // Module may not be loaded - non-critical
  }
}

// ============================================================================
// INTELLIGENCE ENGINE CLEANUP
// ============================================================================

/**
 * Clean up all intelligence engines for a session.
 */
export async function cleanupIntelligenceEnginesAll(
  validatedUserId: string | undefined,
  cleanupEngineKey: string
): Promise<void> {
  // Use unified cleanup if we have a user
  if (validatedUserId) {
    cleanupIntelligenceEngines(validatedUserId);
  }

  // Also clean up by engine key (covers session-only cases)
  removeResponseQualityTracker(cleanupEngineKey);
  removeConversationPatternAnalyzer(cleanupEngineKey);
  removeProactiveInsightEngine(cleanupEngineKey);
  removeFinancialJourneyTracker(cleanupEngineKey);
  removeCrossSessionThreader(cleanupEngineKey);
  removeVoicePaceAdapter(cleanupEngineKey);

  // Human-level interaction engines
  removeHumorCalibration(cleanupEngineKey);
  removeStoryPreference(cleanupEngineKey);
  removeCommunicationMirroring(cleanupEngineKey);
  removeEmotionalMemory(cleanupEngineKey);

  log.info({ userId: validatedUserId }, 'Intelligence engines cleaned up');
}

// ============================================================================
// GROWTH & CACHE
// ============================================================================

/**
 * Capture growth snapshot at session end.
 */
export async function captureGrowthSnapshot(userId: string, services: SessionServices): Promise<void> {
  try {
    const { getGrowthVisibilityEngine } = await import('../growth-visibility-engine.js');
    const growthEngine = getGrowthVisibilityEngine(userId);
    growthEngine.captureSnapshot();

    if (services.userProfile) {
      const growthData = growthEngine.exportForProfile();
      services.userProfile.customData = {
        ...services.userProfile.customData,
        growthSnapshots: growthData.snapshots,
        growthInsights: growthData.insights,
      };
    }
    log.debug({ userId }, '🌱 Growth snapshot captured');
  } catch (error) {
    log.debug({ error }, 'Growth snapshot capture failed (non-blocking)');
  }
}

/**
 * Clear life data cache for user.
 */
export async function clearLifeDataCache(userId: string): Promise<void> {
  try {
    const { getLifeDataStore } = await import('../stores/life-data-store.js');
    getLifeDataStore().clearUserCache(userId);
  } catch (error) {
    log.debug({ error }, 'Failed to clear life data cache (non-blocking)');
  }
}

// ============================================================================
// REALTIME MEMORY
// ============================================================================

/**
 * Finalize realtime memory and trigger async summarization.
 */
export async function finalizeRealtimeMemory(userId: string, conversationId: string): Promise<void> {
  try {
    await realtimeMemory.endConversation(userId, conversationId);

    // Fire-and-forget async summarization
    realtimeMemory.summarizeConversationAsync(userId, conversationId).catch((err) => {
      log.warn(
        { error: String(err), conversationId },
        'Async summarization failed (turns are still persisted)'
      );
    });

    log.info(
      { userId, conversationId },
      '🔴 REALTIME: Conversation ended, async summarization triggered'
    );
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      'Failed to end realtime conversation (non-blocking)'
    );
  }
}

// ============================================================================
// TRUST PERSISTENCE
// ============================================================================

/**
 * Flush unified trust persistence at session end.
 */
export async function flushTrustPersistence(userId: string): Promise<void> {
  try {
    await onSessionEndUnified(userId);
  } catch {
    // Non-critical
  }
}

// ============================================================================
// MEMORY INDEXING
// ============================================================================

/**
 * Index user memories for semantic search (fire-and-forget).
 */
export async function indexUserMemories(userId: string, profile: UserProfile): Promise<void> {
  try {
    const { indexUserMemories: doIndex } = await import('../../memory/user-memory-indexer.js');
    void doIndex(userId, profile, {
      categories: [
        'key_moment',
        'person',
        'thread',
        'followup',
        'life_event',
        'goal',
        'important_date',
        'value',
        'dream',
        'fear',
        'growth_marker',
        'challenge',
        'comfort_pattern',
        'stress_trigger',
      ],
    })
      .then((result) => {
        if (result.indexed > 0) {
          log.info(
            { userId, indexed: result.indexed, categories: result.categories },
            '🧠 User memories indexed for semantic search'
          );
        }
      })
      .catch((err) => {
        log.debug({ error: String(err) }, 'User memory indexing failed (non-blocking)');
      });
  } catch (error) {
    log.debug({ error: String(error) }, 'User memory indexer not available');
  }
}

// ============================================================================
// OUTREACH ANALYSIS
// ============================================================================

/**
 * Analyze session for outreach opportunities.
 */
export async function analyzeForOutreach(
  userId: string,
  sessionId: string,
  personaId: string | undefined,
  services: SessionServices,
  turns: ConversationTurn[],
  summary: ConversationSummary | null
): Promise<void> {
  try {
    const { analyzeSessionForOutreach } = await import('../outreach/session-integration.js');
    const result = await analyzeSessionForOutreach({
      userId,
      sessionId,
      personaId: personaId || 'ferni',
      turns: turns.map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content,
      })),
      summary: summary
        ? {
            mainTopics: summary.mainTopics,
            keyPoints: summary.keyPoints,
            emotionalArc: summary.emotionalArc,
          }
        : undefined,
      durationMinutes: Math.round((Date.now() - services.sessionStartTime) / 60000),
      satisfaction: 'unknown',
    });

    if (result.triggersCreated > 0) {
      log.info(
        { userId, commitments: result.commitmentsFound, triggers: result.triggersCreated },
        '📤 Analyzed session for outreach'
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Outreach analysis skipped (non-fatal)');
  }
}

// ============================================================================
// VOICE SKETCH UPDATE
// ============================================================================

/**
 * Update voice fingerprint for cross-device recognition.
 */
export async function updateVoiceSketch(
  userId: string,
  sessionId: string,
  sessionStartTime: number
): Promise<void> {
  try {
    const { getBaseline } = await import('../trust-systems/voice-prosody-learning.js');
    const { updateUserVoiceSketch } = await import('../voice/voice-sketch-builder.js');

    const baseline = getBaseline(userId);
    if (baseline && baseline.sampleCount >= 3) {
      const sessionDurationMs = Date.now() - sessionStartTime;
      await updateUserVoiceSketch(
        userId,
        sessionId,
        {
          pitchMean: baseline.characteristics.pitchMean,
          pitchRange: baseline.characteristics.pitchRange,
          pitchVariability: baseline.characteristics.pitchVariability,
          energyMean: baseline.characteristics.energyMean,
          energyRange: baseline.characteristics.energyRange,
          energyVariability: baseline.characteristics.energyVariability,
          speakingRate: baseline.characteristics.speakingRate,
          pauseFrequency: baseline.characteristics.pauseFrequency,
          pauseDuration: baseline.characteristics.pauseDuration,
        },
        sessionDurationMs,
        baseline.sampleCount
      );
    }
  } catch (voiceError) {
    log.debug({ error: String(voiceError) }, 'Voice sketch update skipped');
  }
}

// ============================================================================
// SOCIAL GRAPH PERSISTENCE
// ============================================================================

/**
 * Persist social graph and clear rate limits at session end.
 */
export async function persistSocialGraphOnEnd(userId: string): Promise<void> {
  try {
    const { persistSocialGraph, clearRateLimits } = await import('../realtime-persistence.js');
    await persistSocialGraph(userId);
    clearRateLimits(userId);
    log.debug({ userId }, '📇 Final social graph persistence completed');
  } catch (persistError) {
    log.warn({ error: String(persistError) }, 'Failed to persist social graph on session end');
  }
}

// ============================================================================
// DYNAMIC MEMORY PROMOTION
// ============================================================================

/**
 * Promote STM (Short-Term Memory) to Firestore at session end.
 * Also queues memory consolidation for async processing.
 */
export async function promoteSTMToFirestore(sessionId: string, userId: string): Promise<void> {
  log.info({ sessionId, userId }, '🧠 [MEMORY-AUDIT] Calling STM promotion from end-session');
  try {
    const { onSessionEnd } = await import('../../memory/dynamic/stm-promotion.js');
    await onSessionEnd(sessionId, userId);
    log.info({ sessionId, userId }, '🧠 [MEMORY-AUDIT] STM promotion completed from end-session');

    // Queue memory consolidation for async processing
    // This allows related memories to be consolidated shortly after session ends
    try {
      const { queueMemoryConsolidation } = await import('../../workers/summarization-worker.js');
      queueMemoryConsolidation(userId);
      log.debug({ sessionId, userId }, '🧠 [MEMORY-AUDIT] Memory consolidation queued');
    } catch (consolidationError) {
      // Non-critical - scheduled job will handle it
      log.debug({ error: String(consolidationError), userId }, '🧠 Memory consolidation queue skipped');
    }
  } catch (stmError) {
    log.warn({ error: String(stmError), sessionId, userId }, '🧠 [MEMORY-AUDIT] STM promotion FAILED');
  }
}
