/**
 * Voice Agent Cleanup Handler
 *
 * Handles ALL cleanup on session disconnect. Extracted from voice-agent.ts
 * to reduce file size and improve maintainability.
 *
 * @module voice-agent/cleanup-handler
 */

import { log } from '@livekit/agents';
import { resetDJController, resetDJTimingEngine } from '../../audio/index.js';
import {
  flushLearningSignals,
  onDeepUnderstandingSessionEnd as saveDeepUnderstandingProfiles,
} from '../../intelligence/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { recordSessionEnd as recordUserSessionEnd } from '../../services/analytics/user-analytics.js';
import { emitConversationEnd } from '../../services/async-events/index.js';
import { onCognitiveSessionEnd } from '../../services/cognitive-session-hooks.js';
import { endConversation as endConversationState } from '../../services/conversation-state.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { onSessionEnd as saveTrustProfiles } from '../../services/trust-systems/index.js';
import { recordSessionEnd } from '../../services/voice/voice-humanization-metrics.js';
// 🎤 Speech module cleanup - single source of truth for 30+ session-scoped services
import {
  cleanupProsodyBridge,
  persistOnSessionEnd as saveHumanizationState,
} from '../../conversation/humanization/index.js';
import { cleanupSpeechSession } from '../../speech/session-cleanup.js';
// 🌊 Naturalness Engine - voice pattern persistence
import { persistNaturalnessData } from '../../speech/naturalness/index.js';
// FIX AUDIT: Merged handoff imports to avoid duplicate import warning
import {
  cameoUnlockEvents,
  handoffEvents,
  resetHandoffState,
  resetMetPersonas,
} from '../../tools/handoff/index.js';
import { getDJController } from '../../audio/dj-controller.js';
// 🎭 Unified conversation session cleanup - loaded dynamically to avoid startup timeout
// import { cleanupConversationSession } from '../integrations/conversation-session-integration.js';
// FIX AUDIT: Import from service layer instead of API routes (clean architecture)
import { unregisterSessionTTS } from '../../services/session/index.js';
import { cleanupDynamicSpeed } from '../integrations/dynamic-speed-integration.js';
import {
  finalizeSpeechMetrics,
  logMetricsSummary,
} from '../integrations/speech-metrics-integration.js';
// GC pressure baseline metrics (for Rust migration validation)
import { logGcPressureSummary } from '../../utils/performance-metrics.js';

// Better-than-human API services cleanup
import { clearEmotionalArc } from '../../intelligence/context-builders/emotional/advanced-voice-emotion.js';
// Session analytics collection - emotional arc, commitments, insights
import { getEmotionalArcTracker } from '../../conversation/emotional-arc.js';
import { getInsightsForPersona } from '../../services/cross-persona-insights.js';
import type {
  EmotionalMoment,
  SessionInsight,
} from '../../services/session-context/session-summary.js';
import { commitmentKeeper } from '../../services/superhuman/commitment-keeper.js';

// NEW: Unified Intelligence System (Levels 2-5) cleanup
import { cleanupIntelligenceSession } from '../integrations/unified-intelligence-integration.js';

// Capability learning - track which capabilities resonated
import { finalizeSessionLearning } from '../../intelligence/capability-learning.js';
import { clearSession as clearHumeSession } from '../../services/emotion-analysis/hume.js';

// FIX AUDIT: Import seed economy from service layer (clean architecture)
import { awardSeedsForConversation } from '../../services/seed-economy.js';

// Session closing tracker - prevents operations during shutdown
import { clearSessionClosing, markSessionClosing } from '../shared/session-closing-tracker.js';

// Developer Platform: Webhook integration for marketplace personas
import { onSessionEnded as dispatchSessionEndedWebhook } from '../integrations/developer-webhook-integration.js';

// Event cleanup registry for tracking and cleaning up event handlers
import { runSessionCleanup as runRegistryCleanup } from '../session/event-cleanup-registry.js';

// P0 INTEGRATION: Context Carrier & Memory Session Cleanup
import { resetProactiveSession } from '../../services/proactive-memory-surfacing.js';
import { getUnifiedMemoryService } from '../../services/unified-memory-service.js';
import { getContextCarrier } from '../../tools/context-carrier.js';

// Action history cleanup - for honesty guardrail tracking
import { clearSessionHistory } from '../shared/action-history.js';

// Session health monitor cleanup - function calling reliability (Jan 2026)
import { clearHealthMonitor } from '../shared/session-health-monitor.js';

// Function call telemetry session cleanup (Jan 2026)
import { clearSession as clearTelemetrySession } from '../shared/function-call-telemetry.js';

// Injection builders cache cleanup (Jan 2026 optimization)
import { clearNonVolatileInjectionCache } from '../processors/injection-builders.js';

// FinOps cost tracking
import { finops } from '../../services/observability/finops.js';

// BTH v4: Superhuman Intelligence Enhancements cleanup
import { cleanupSession as cleanupSuperhumanIntelligenceSession } from '../../intelligence/context-builders/superhuman/superhuman-intelligence-context.js';
import { getEmotionalMomentumTracker } from '../../conversation/emotional-arc/momentum/tracker.js';
import { getMicroMomentDetector } from '../../intelligence/deep-understanding/micro-moments/engine.js';
import { getAvoidanceDetector } from '../../intelligence/deep-understanding/avoidance-detection/engine.js';
import { getPatternConnector } from '../../intelligence/deep-understanding/pattern-connector/engine.js';
import { getStoryArcTracker } from '../../intelligence/story-tracking/engine.js';

// Relationship Arc - Better Than Human relationship progression
import { incrementSessionStats } from '../../intelligence/context-builders/relationship/arc/storage.js';
// Resilience metrics
import { resilienceMetrics } from '../../services/observability/resilience-metrics.js';

// Session Lifecycle Hooks - presence clearing, affinity updates, outreach suppression
import { sessionLifecycle } from '../../services/session/session-lifecycle-hooks.js';

// Interval Manager - for session heartbeat cleanup
import { clearNamedInterval } from '../../utils/interval-manager.js';

// FIX AUDIT: Import proper types for event handlers instead of using `any`
import type { HandoffEventPayload } from '../shared/handoff/types.js';

// 🧠 DEEP SIGNAL EXTRACTION: LLM-powered extraction at session end
import { LLMSignalExtractor } from '../../memory/llm-signal-extractor.js';
import { callLLM } from '../../services/llm-utils.js';

// ============================================================================
// CLEANUP TIMEOUT PROTECTION
// ============================================================================

/** Default timeout for session cleanup (10 seconds) */
const SESSION_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Create a timeout promise that rejects after the specified duration.
 * Used to prevent cleanup from hanging indefinitely.
 *
 * FIX: Returns both the promise and a cleanup function to clear the timer
 * when cleanup completes normally (prevents resource leak).
 */
function createCleanupTimeout(ms: number): { promise: Promise<never>; clear: () => void } {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const promise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Session cleanup timeout after ${ms}ms`));
    }, ms);
  });

  const clear = (): void => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
  };

  return { promise, clear };
}

/**
 * Voice humanization integration interface for cleanup
 */
interface VoiceHumanizationCleanup {
  cleanup: () => void;
}

/**
 * User data with trial info and trigger profiles
 */
interface UserDataWithTrial {
  turnCount?: number;
  isTrialUser?: boolean;
  isFirstConversation?: boolean;
  // Phase 5: Anticipatory trigger profile for session-end save
  triggerProfile?: import('../../intelligence/triggers/index.js').UserTriggerProfile;
}

/**
 * Cameo unlock event data for team member introductions
 * FIX AUDIT: Properly typed instead of `any`
 */
export interface CameoUnlockEventData {
  memberId: string;
  displayName: string;
  role: string;
  spokenIntro: string;
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
  patternAnalyzer?: { endSession: (sessionId: string) => void };
  autoOptimizer: { endSession: (sessionId: string) => void };
  feedbackCollector?: { flush: () => Promise<void> };
  // Additional cleanup functions
  dataChannelCleanup?: () => void;
  // FIX AUDIT: Properly typed handler instead of `any`
  // NOTE: Handler may be async (returns Promise<void>) as per EventHandlerResult type
  handoffHandler?: (data: HandoffEventPayload) => void | Promise<void>;
  // FIX AUDIT: Properly typed handler instead of `any`
  cameoUnlockHandler?: (data: CameoUnlockEventData) => void;
  cameoCleanup?: () => void;
  musicCleanup?: () => void | Promise<void>;
  // User data for trial tracking
  userData?: UserDataWithTrial;
  // Periodic sync cleanup
  stopPeriodicSync?: (() => void) | null;
  // Publisher ID for marketplace/custom personas (Developer Platform)
  publisherId?: string;
  // Session start time for calculating duration
  sessionStartTime?: number;
}

/**
 * Handle all cleanup tasks when a session disconnects.
 * Non-fatal - errors are logged but don't prevent other cleanup.
 *
 * PERFORMANCE: Cleanup is now parallelized into 4 groups:
 * - Group 1: Event listeners (sync, immediate)
 * - Group 2: Independent data persistence (parallel)
 * - Group 3: Independent service cleanup (parallel)
 * - Group 4: Final teardown (sequential, must be last)
 *
 * RESILIENCE: Wrapped with 10-second timeout to prevent zombie sessions.
 * If cleanup exceeds timeout, logs warning but continues gracefully.
 *
 * @param ctx - Cleanup context with session data and services
 * @param timeoutMs - Optional timeout override (default: 10 seconds)
 */
export async function handleSessionCleanup(
  ctx: CleanupContext,
  timeoutMs = SESSION_CLEANUP_TIMEOUT_MS
): Promise<void> {
  const { sessionId } = ctx;
  const cleanupStart = Date.now();

  // CRITICAL: Mark session as closing IMMEDIATELY to prevent operations during shutdown
  // This prevents race conditions like handoffs being attempted on draining sessions
  markSessionClosing(sessionId);

  let timedOut = false;
  let success = true;

  // FIX: Create timeout with cleanup function to prevent resource leak
  const timeout = createCleanupTimeout(timeoutMs);

  try {
    // Wrap cleanup with timeout protection to prevent zombie sessions
    await Promise.race([executeSessionCleanup(ctx, cleanupStart), timeout.promise]);
  } catch (error) {
    const elapsed = Date.now() - cleanupStart;
    success = false;

    if (String(error).includes('timeout')) {
      timedOut = true;
      // Timeout occurred - log warning but don't fail
      diag.warn('⚠️ Session cleanup timeout - some resources may not be fully cleaned', {
        sessionId,
        timeoutMs,
        elapsedMs: elapsed,
      });
    } else {
      // Other cleanup error
      diag.error('Session cleanup error', { error: String(error), sessionId, elapsedMs: elapsed });
    }
  } finally {
    // FIX: Always clear the timeout to prevent resource leak
    timeout.clear();

    // Record cleanup metrics for resilience monitoring
    const elapsed = Date.now() - cleanupStart;
    resilienceMetrics.recordCleanupEvent(
      sessionId,
      elapsed,
      success,
      timedOut,
      9, // 9 cleanup groups total
      success ? 0 : 1
    );

    // Clear session closing flag to prevent memory leak
    clearSessionClosing(sessionId);
  }
}

/**
 * Internal cleanup implementation - separated for timeout wrapping.
 */
async function executeSessionCleanup(ctx: CleanupContext, cleanupStart: number): Promise<void> {
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
    cameoUnlockHandler,
    cameoCleanup,
    musicCleanup,
    userData,
    stopPeriodicSync,
    publisherId,
    sessionStartTime,
  } = ctx;

  // ================================================================
  // DEVELOPER PLATFORM: DISPATCH SESSION ENDED WEBHOOK (fire-and-forget)
  // Only fires if publisherId is available (marketplace/custom personas)
  // ================================================================
  const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : undefined;
  dispatchSessionEndedWebhook({
    sessionId,
    userId,
    personaId: sessionPersona.id,
    publisherId,
    duration: sessionDuration,
  });

  // ================================================================
  // GROUP 1: SYNCHRONOUS EVENT LISTENER CLEANUP (immediate, prevents memory leaks)
  // ================================================================
  if (dataChannelCleanup) dataChannelCleanup();
  if (handoffHandler) handoffEvents.off('voiceSwitch', handoffHandler);
  if (cameoUnlockHandler) cameoUnlockEvents.off('memberUnlocked', cameoUnlockHandler);
  if (cameoCleanup) cameoCleanup();
  if (stopPeriodicSync) stopPeriodicSync();

  // Clear session heartbeat interval
  clearNamedInterval(`session-heartbeat-${sessionId}`);

  // Clear action history (for honesty guardrail - prevents memory bloat)
  clearSessionHistory(sessionId);

  // End conversation state (needed for data below)
  const finalConvState = await endConversationState(sessionId);
  if (finalConvState) {
    diag.session('Conversation state ended', {
      turnCount: finalConvState.flow.turnCount,
      durationMinutes: finalConvState.flow.durationMinutes,
    });
  }

  const sessionDurationMs = services?.sessionStartTime ? Date.now() - services.sessionStartTime : 0;

  // End FinOps session tracking
  const sessionCost = finops.endSession(sessionId);
  if (sessionCost) {
    diag.session('FinOps session ended', {
      totalCost: sessionCost.totalCost.toFixed(4),
      durationMinutes: sessionCost.durationMinutes.toFixed(1),
    });
  }

  // Emit async event for background processing
  emitConversationEnd({
    sessionId,
    userId: userId || 'anonymous',
    personaId: sessionPersona?.id || 'ferni',
    turnCount: finalConvState?.flow.turnCount || userData?.turnCount || 0,
    durationMs: sessionDurationMs,
    emotionalHighlight: finalConvState?.emotional.sentiment,
  });

  // ================================================================
  // P0 INTEGRATION: Context Carrier & Memory Session Cleanup
  // ================================================================
  if (userId) {
    try {
      // End context carrier session and get snapshot
      const contextCarrier = getContextCarrier();
      const snapshot = contextCarrier.endSession(sessionId);
      if (snapshot) {
        diag.session('Context carrier session ended', {
          sessionId,
          surfacedMemories: snapshot.surfacedMemoryCount,
          toolsUsed: snapshot.toolsUsedCount,
          emotionalTrend: snapshot.emotionalTrend,
          duration: snapshot.sessionDuration,
        });
      }

      // Reset memory session state
      const unifiedMemory = getUnifiedMemoryService();
      await unifiedMemory.resetSession(userId);

      // Reset proactive surfacing state
      resetProactiveSession(userId);
    } catch (err) {
      diag.warn('Context carrier/memory cleanup failed (non-fatal)', { error: String(err) });
    }
  }

  // ================================================================
  // GROUP 2: PARALLEL DATA PERSISTENCE (independent, can run together)
  // ================================================================
  const persistenceGroup = await Promise.allSettled([
    // Cognitive session
    cleanupCognitiveSession(userId, sessionPersona.id, sessionId, services),

    // Trust profiles
    userId ? cleanupTrustProfiles(userId) : Promise.resolve(),

    // Deep understanding profiles
    userId ? cleanupDeepUnderstandingProfiles(userId, sessionId) : Promise.resolve(),

    // Relationship memory - persist relationship state at session end
    // Core Principle #2: "Every interaction is part of an ongoing relationship"
    userId ? cleanupRelationshipMemory(userId, sessionPersona.id, sessionId) : Promise.resolve(),

    // Capability learning - track which capabilities resonated for collective learning
    userId ? cleanupCapabilityLearning(userId, sessionId) : Promise.resolve(),

    // Trial time recording
    userData?.isTrialUser && userId
      ? (async () => {
          const { recordTrialTime } = await import('../../services/first-taste-trial.js');
          await recordTrialTime(userId, sessionDurationMs);
          diag.session('Trial time recorded', { userId, sessionDurationMs });
        })()
      : Promise.resolve(),

    // DJ integration summary
    cleanupDJIntegration(services),

    // Utilities cleanup
    utilitiesCleanup ? cleanupUtilities(utilitiesCleanup) : Promise.resolve(),

    // Humanization state persistence
    (async () => {
      const saveResult = await saveHumanizationState(userId || 'anonymous', sessionId);
      if (saveResult.saved) {
        diag.session('🎭 Humanization state persisted', { items: saveResult.items });
      }
    })(),

    // Naturalness Engine - persist learned voice patterns for next session
    (async () => {
      try {
        await persistNaturalnessData(sessionId);
        diag.session('🌊 Voice patterns persisted');
      } catch (naturalnessErr) {
        diag.warn('Voice pattern persistence failed (non-fatal)', {
          error: String(naturalnessErr),
        });
      }
    })(),

    // BTH v4: Superhuman Intelligence Enhancements cleanup
    (async () => {
      try {
        // Clean up context builder session state (also cleans momentum tracker)
        cleanupSuperhumanIntelligenceSession(sessionId);

        // Reset micro-moment detector state
        const microMomentDetector = getMicroMomentDetector();
        microMomentDetector.reset();

        diag.session('🧠 BTH v4: Superhuman intelligence session cleaned up');
      } catch (bthErr) {
        diag.warn('BTH v4 cleanup failed (non-fatal)', {
          error: String(bthErr),
        });
      }
    })(),

    // Identity session
    cleanupIdentitySession(sessionId),

    // Game state
    cleanupGames(sessionId),

    // Seed economy - award 1 seed per completed conversation
    userId
      ? (async () => {
          const result = await awardSeedsForConversation(userId, 1, 'conversation');
          if (result.success) {
            diag.session('🌱 Seed awarded for conversation', {
              userId,
              newBalance: result.newBalance,
            });
          }
        })()
      : Promise.resolve(),

    // Relationship Arc - track session for stage progression (Better Than Human)
    userId
      ? (async () => {
          const turnCount = finalConvState?.flow.turnCount || userData?.turnCount || 0;
          await incrementSessionStats(userId, turnCount);
          diag.session('💕 Relationship arc session recorded', { userId, turnCount });
        })()
      : Promise.resolve(),

    // 🎵 MUSIC LEARNING: Persist Thompson Sampling profiles and music memories
    // This ensures per-user transition preferences survive server restarts
    userId
      ? (async () => {
          try {
            const { flushMusicLearning } = await import('../../audio/music-learning-persistence.js');
            await flushMusicLearning(userId);
            diag.session('🎵 Music learning persisted', { userId });
          } catch (musicErr) {
            diag.warn('Music learning persistence failed (non-fatal)', {
              error: String(musicErr),
            });
          }
        })()
      : Promise.resolve(),

    // 🧠 MEMORY ENHANCEMENT: Persist all memory enhancement systems
    // Tonal Memory, Between-Session Thinking, Curiosity Memory, Persona Growth
    userId
      ? (async () => {
          try {
            const { saveSystemData } =
              await import('../../services/trust-systems/unified-persistence.js');
            const {
              getThinkingRecordsForPersistence,
              getTonalProfileForPersistence,
              getCuriosityProfileForPersistence,
              getPersonaGrowthForPersistence,
              finalizeSessionTexture,
              getTextureProfileForPersistence,
            } = await import('../../services/trust-systems/index.js');

            // Finalize conversation texture for this session
            finalizeSessionTexture(userId);

            // Get all profiles for persistence
            const thinkingRecords = getThinkingRecordsForPersistence(userId);
            const tonalProfile = getTonalProfileForPersistence(userId);
            const textureProfile = getTextureProfileForPersistence(
              userId,
              sessionPersona?.id || 'ferni'
            );
            const curiosityProfile = getCuriosityProfileForPersistence(userId);
            const growthProfile = getPersonaGrowthForPersistence(
              userId,
              sessionPersona?.id || 'ferni'
            );

            // Save to unified persistence (fire-and-forget per system)
            await Promise.all([
              thinkingRecords.length > 0
                ? saveSystemData(userId, 'betweenSessionThinking', thinkingRecords)
                : Promise.resolve(),
              tonalProfile
                ? saveSystemData(userId, 'tonalMemory', tonalProfile)
                : Promise.resolve(),
              curiosityProfile
                ? saveSystemData(userId, 'curiosityMemory', curiosityProfile)
                : Promise.resolve(),
              growthProfile
                ? saveSystemData(userId, 'personaGrowth', {
                    [sessionPersona?.id || 'ferni']: growthProfile,
                  })
                : Promise.resolve(),
              textureProfile
                ? saveSystemData(userId, 'conversationTexture', {
                    [sessionPersona?.id || 'ferni']: textureProfile,
                  })
                : Promise.resolve(),
            ]);

            diag.session('🧠 Memory enhancement profiles persisted', {
              userId,
              thinkingRecords: thinkingRecords.length,
              hasTonalProfile: !!tonalProfile,
              hasCuriosityProfile: !!curiosityProfile,
              hasGrowthProfile: !!growthProfile,
              hasTextureProfile: !!textureProfile,
            });

            // 🔍 SEMANTIC INDEXING: Index to data layer for semantic search
            // Fire-and-forget - don't block cleanup for indexing
            try {
              const { onConversationTextureChange, onBetweenSessionThinkingChange } =
                await import('../../services/data-layer/hooks/trust-hooks.js');

              // Index conversation texture
              if (textureProfile) {
                // Get the latest snapshot for energy pattern
                const latestSnapshot =
                  textureProfile.snapshots?.[textureProfile.snapshots.length - 1];
                void onConversationTextureChange(
                  userId,
                  sessionId,
                  {
                    personaId: sessionPersona?.id || 'ferni',
                    sessionId,
                    tone: textureProfile.patterns?.usualTone || 'mixed',
                    depth: textureProfile.patterns?.usualDepth || 'moderate',
                    rhythm: textureProfile.patterns?.usualRhythm || 'flowing',
                    topics: textureProfile.patterns?.frequentTopics?.slice(0, 5) || [],
                    energyPattern: latestSnapshot?.energy || 'steady',
                    date: new Date().toISOString(),
                  },
                  'create'
                );
              }

              // Index between-session thinking for semantic retrieval
              for (const record of thinkingRecords.slice(0, 5)) {
                const createdAtStr =
                  record.createdAt instanceof Date
                    ? record.createdAt.toISOString()
                    : (record.createdAt as string) || new Date().toISOString();
                void onBetweenSessionThinkingChange(
                  userId,
                  record.id || `thinking-${Date.now()}`,
                  {
                    topic: record.topic,
                    reflection: record.userQuote || record.topic,
                    depth: record.emotionalWeight === 'heavy' ? 'deep' : 'moderate',
                    emotionalTone: record.emotionalWeight,
                    createdAt: createdAtStr,
                  },
                  'create'
                );
              }

              diag.session('🔍 Memory enhancement indexed to semantic layer', {
                userId,
                textureIndexed: !!textureProfile,
                thinkingIndexed: Math.min(thinkingRecords.length, 5),
              });
            } catch (indexErr) {
              diag.debug('Semantic indexing failed (non-fatal)', { error: String(indexErr) });
            }
          } catch (memErr) {
            diag.warn('Memory enhancement persistence failed (non-fatal)', {
              error: String(memErr),
            });
          }
        })()
      : Promise.resolve(),

    // Session Lifecycle - clear presence, update persona affinity, suppress outreach
    userId
      ? (async () => {
          const turnCount = finalConvState?.flow.turnCount || userData?.turnCount || 0;
          const durationMinutes = finalConvState?.flow.durationMinutes || sessionDurationMs / 60000;
          const sentiment = finalConvState?.emotional.sentiment;
          const topic = finalConvState?.topic?.current;

          // Determine sentiment for affinity tracking
          let sessionSentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
          if (sentiment === 'mixed') {
            sessionSentiment = 'neutral';
          } else if (sentiment === 'negative') {
            sessionSentiment = 'negative';
          } else if (sentiment === 'neutral') {
            sessionSentiment = 'neutral';
          }
          // Note: 'positive' sentiment would map to 'positive' if the type supports it

          const topics = topic ? [topic] : [];

          // Determine engagement level
          let engagement: 'low' | 'medium' | 'high' = 'medium';
          if (turnCount >= 20 || durationMinutes >= 15) {
            engagement = 'high';
          } else if (turnCount <= 5 || durationMinutes <= 3) {
            engagement = 'low';
          }

          await sessionLifecycle.onEnd(userId, sessionId, {
            personaId: sessionPersona?.id || 'ferni',
            duration: durationMinutes,
            topics,
            sentiment: sessionSentiment,
            userEngagement: engagement,
          });
          diag.session('🔄 Session lifecycle ended', {
            userId,
            sentiment: sessionSentiment,
            engagement,
          });
        })()
      : Promise.resolve(),

    // 📱 SESSION SUMMARY: Store for Voice ↔ App sync (Better Than Human)
    // This enables the app to show insights from this conversation
    userId
      ? (async () => {
          try {
            const { storeSessionSummary } =
              await import('../../services/session-context/session-summary.js');
            const turnCount = finalConvState?.flow.turnCount || userData?.turnCount || 0;
            const startTime = services?.sessionStartTime
              ? new Date(services.sessionStartTime)
              : new Date(Date.now() - sessionDurationMs);

            // Extract topic string from conversation state
            const topicStr = finalConvState?.topic?.current || 'general topics';

            // Collect insights from cross-persona insights service
            // SurfaceInsightItem has { insight: { id, category, summary, sourcePersona }, relevanceScore }
            const rawInsights = getInsightsForPersona(userId, sessionPersona?.id || 'ferni');
            
            // 🐛 FIX: Deduplicate insights by content to prevent same insight appearing multiple times
            const seenContents = new Set<string>();
            const dedupedInsights = rawInsights.filter((item) => {
              const contentKey = item.insight.summary.toLowerCase().trim();
              if (seenContents.has(contentKey)) {
                return false;
              }
              seenContents.add(contentKey);
              return true;
            });
            
            const insightsGenerated: SessionInsight[] = dedupedInsights.slice(0, 10).map((item) => ({
              type:
                item.relevanceScore >= 0.8
                  ? 'breakthrough'
                  : item.insight.category === 'emotional'
                    ? 'concern'
                    : item.insight.category === 'pattern'
                      ? 'pattern'
                      : 'memory',
              content: item.insight.summary,
              confidence: item.relevanceScore,
              timestamp: new Date(),
              personaId: item.insight.sourcePersona,
            }));

            // Collect commitments from commitment keeper
            const userCommitments = await commitmentKeeper.load(userId);
            const sessionCommitments = userCommitments
              .filter((c) => c.createdAt > startTime.getTime())
              .map((c) => c.summary);

            // Collect emotional arc from tracker
            const emotionalTracker = getEmotionalArcTracker();
            const arc = emotionalTracker.getArc();
            const emotionalArc: EmotionalMoment[] = arc
              ? [
                  {
                    timestamp: new Date(),
                    emotion: arc.currentEmotion,
                    intensity: arc.currentArousal,
                    trigger: arc.trajectory,
                  },
                ]
              : [];

            // Detect unfinished topics from conversation state
            const unfinishedTopics: string[] = [];
            // pendingCircleBack contains { topic: string, reason: string, mentionedAt: Date }
            if (
              finalConvState?.topic?.pendingCircleBack &&
              Array.isArray(finalConvState.topic.pendingCircleBack)
            ) {
              unfinishedTopics.push(...finalConvState.topic.pendingCircleBack.map((p) => p.topic));
            }

            await storeSessionSummary({
              sessionId,
              userId,
              startedAt: startTime,
              endedAt: new Date(),
              durationSeconds: Math.round(sessionDurationMs / 1000),
              personasEngaged: [sessionPersona?.id || 'ferni'],
              mainTopics: topicStr !== 'general topics' ? [topicStr] : [],
              naturalSummary: `Conversation about ${topicStr}`,
              insightsGenerated,
              unfinishedTopics,
              commitmentsMade: sessionCommitments,
              emotionalArc,
              endingEmotionalState: finalConvState?.emotional?.sentiment || 'neutral',
              wasSignificant: turnCount >= 5 || sessionDurationMs >= 5 * 60 * 1000,
              significanceScore: Math.min(
                1,
                turnCount * 0.1 + sessionDurationMs / (30 * 60 * 1000)
              ),
            });
            diag.session('📱 Session summary stored for app sync', {
              userId,
              turnCount,
              insightsCount: insightsGenerated.length,
              commitmentsCount: sessionCommitments.length,
            });
          } catch (err) {
            diag.warn('Session summary storage failed (non-fatal)', { error: String(err) });
          }
        })()
      : Promise.resolve(),

    // Personality resonance - flush to Firestore
    userId
      ? (async () => {
          const { flushResonanceProfile } =
            await import('../../personas/shared/personality-resonance-store.js');
          await flushResonanceProfile(userId);
          diag.session('🎭 Personality resonance profile persisted');
        })()
      : Promise.resolve(),

    // 🧠 DEEP SIGNAL EXTRACTION: Extract and persist deep signals from conversation
    userId
      ? (async () => {
          try {
            const { getLastConversationContext } = await import('../../services/memory/realtime-memory.js');
            const { saveMemoryDirect } = await import('../../services/unified-memory-service.js');

            // Get conversation context for signal extraction
            const context = await getLastConversationContext(userId);
            if (!context || !context.turns || context.turns.length === 0) {
              diag.debug('No conversation turns for deep signal extraction');
              return;
            }

            // Extract deep signals from the conversation
            const signals: Array<{ type: string; content: string; weight: number }> = [];

            // Look for emotional moments
            for (const turn of context.turns) {
              if (turn.metadata?.emotion && turn.role === 'user') {
                const intensity = turn.metadata.durationMs ? turn.metadata.durationMs / 10000 : 0.5;
                if (intensity > 0.6) {
                  signals.push({
                    type: 'emotion',
                    content: `Expressed ${turn.metadata.emotion}: ${turn.content.slice(0, 100)}`,
                    weight: Math.min(intensity, 1.0),
                  });
                }
              }

              // Look for commitment-like statements
              const commitmentPatterns = [
                /i (will|want to|need to|should|must|have to)/i,
                /i('m| am) going to/i,
                /my goal is/i,
                /i promise/i,
              ];
              if (turn.role === 'user' && commitmentPatterns.some((p) => p.test(turn.content))) {
                signals.push({
                  type: 'commitment',
                  content: turn.content.slice(0, 200),
                  weight: 0.7,
                });
              }
            }

            // Save extracted signals
            let savedCount = 0;
            for (const signal of signals.slice(0, 5)) {
              // Limit to 5 signals per session
              const result = await saveMemoryDirect(userId, {
                content: signal.content,
                type: signal.type as 'emotion' | 'commitment',
                emotionalWeight: signal.weight,
                metadata: { extractedAt: new Date().toISOString(), sessionId },
              });
              if (result.success) savedCount++;
            }

            if (savedCount > 0) {
              diag.session('🧠 Deep signals extracted and persisted', {
                userId,
                signalsExtracted: signals.length,
                signalsSaved: savedCount,
              });
            }
          } catch (error) {
            diag.warn('Deep signal extraction failed (non-fatal)', { error: String(error) });
          }
        })()
      : Promise.resolve(),

    // LLM expressions - flush high-engagement to Firestore
    userId
      ? (async () => {
          const { flushExpressions } =
            await import('../../personas/bundles/ferni/llm-expression-generator.js');
          await flushExpressions(userId);
          diag.session('🎭 High-engagement expressions persisted');
        })()
      : Promise.resolve(),

    // Phase 5: Anticipatory trigger profile - save learned signals
    userId && userData?.triggerProfile
      ? (async () => {
          const { saveUserTriggerContext } =
            await import('../../intelligence/triggers/voice-agent-integration.js');
          const { clearAnticipatorySession } =
            await import('../../intelligence/triggers/anticipatory-trigger-engine.js');
          // Save the trigger profile (includes learned signals and outcome events)
          const saved = await saveUserTriggerContext(sessionId);
          // Clean up session memory
          clearAnticipatorySession(sessionId);
          if (saved) {
            diag.session('🔮 Anticipatory trigger profile persisted', {
              userId,
              learnedSignals:
                userData.triggerProfile?.anticipatoryIntelligence?.signals?.length ?? 0,
            });
          }
        })()
      : Promise.resolve(),
  ]);

  // Log any failures from persistence group
  persistenceGroup.forEach((result, index) => {
    if (result.status === 'rejected') {
      diag.warn(`Persistence cleanup ${index} failed (non-fatal)`, {
        error: String(result.reason),
      });
    }
  });

  diag.session('✅ Persistence group complete', {
    durationMs: Date.now() - cleanupStart,
    succeeded: persistenceGroup.filter((r) => r.status === 'fulfilled').length,
    failed: persistenceGroup.filter((r) => r.status === 'rejected').length,
  });

  // ================================================================
  // GROUP 3: PARALLEL SERVICE CLEANUP (independent, can run together)
  // ================================================================
  const serviceGroup = await Promise.allSettled([
    // Handoff tools session cache cleanup (prevents memory leaks)
    (async () => {
      try {
        const { clearHandoffToolsCache } = await import(
          '../../tools/handoff/session-cache.js'
        );
        clearHandoffToolsCache(sessionId);
      } catch {
        // Non-critical, ignore
      }
    })(),

    // GlobalThis session data cleanup (prevents memory leaks from session-init-handler)
    (async () => {
      // Clean up trigger context and life context stored on globalThis
      // These are set in session-init-handler.ts and must be cleaned up here
      const globalThisTyped = globalThis as Record<string, unknown>;
      const triggerKey = `_triggerContext_${sessionId}`;
      const lifeContextKey = `_lifeContext_${sessionId}`;

      if (triggerKey in globalThisTyped) {
        delete globalThisTyped[triggerKey];
      }
      if (lifeContextKey in globalThisTyped) {
        delete globalThisTyped[lifeContextKey];
      }

      diag.session('🧹 GlobalThis session data cleaned up');
    })(),

    // Session-scoped state cleanup (legacy)
    (async () => {
      const { clearHandoffSessionState } = await import('../shared/handoff/session-state.js');
      clearHandoffSessionState(sessionId);
    })(),

    // Unified handoff state cleanup (new architecture - clears timers, EventEmitters)
    (async () => {
      const { clearSession } = await import('../../handoff/unified-state.js');
      clearSession(sessionId);
    })(),

    // Tool deduplication cache cleanup (prevents unbounded memory growth)
    (async () => {
      const { clearToolDeduplicationForSession } = await import('../shared/sanitizer/index.js');
      clearToolDeduplicationForSession(sessionId);
    })(),

    // Coordinator adapter cleanup (prevents memory leaks)
    (async () => {
      const { removeSessionAdapter } = await import('../shared/handoff/coordinator-adapter.js');
      removeSessionAdapter(sessionId);
    })(),

    (async () => {
      const { resetSessionState } = await import('../../services/cameo/index.js');
      resetSessionState(sessionId);
    })(),

    // Music cleanup (musicCleanup now disposes the singleton to prevent pollution)
    (async () => {
      if (musicCleanup) await musicCleanup();
      cleanupDJBooth();
      await cleanupMusic();
    })(),

    // Voice humanization cleanup
    (async () => {
      cleanupVoiceHumanization(voiceHumanization, sessionId);
      recordSessionEnd(sessionId);
      void recordUserSessionEnd(sessionId, userData?.turnCount || 0, []).catch((err) => {
        diag.debug('Session end recording failed (non-critical)', { error: String(err) });
      });
      unregisterSessionTTS(sessionId);
      cleanupSpeechSession(sessionId, { verbose: false, reason: 'normal' });
      logMetricsSummary(sessionId);
      logGcPressureSummary(); // GC pressure baseline for Rust migration
      finalizeSpeechMetrics(sessionId, true);
      cleanupDynamicSpeed(sessionId);
    })(),

    // World awareness
    (async () => {
      const { cleanupWorldAwareness } =
        await import('../../services/world-awareness/session-integration.js');
      cleanupWorldAwareness(userId || 'anonymous');
    })(),

    // Personal journey
    (async () => {
      const { cleanupPersonalJourney } =
        await import('../../services/personal-journey/session-integration.js');
      cleanupPersonalJourney(userId || 'anonymous');
    })(),

    // Unified conversation session
    (async () => {
      const { cleanupConversationSession } =
        await import('../integrations/conversation-session-integration.js');
      cleanupConversationSession(sessionId);
    })(),

    // Predictive Intelligence cleanup + ML state flush
    (async () => {
      const { cleanupPredictiveIntelligence } =
        await import('../integrations/predictive-intelligence-integration.js');
      cleanupPredictiveIntelligence(sessionId, userId);
    })(),

    // Humanization analytics
    (async () => {
      const { humanizationAnalytics } =
        await import('../../conversation/humanization/analytics.js');
      const analyticsStats = humanizationAnalytics.endSession(sessionId);
      if (analyticsStats) {
        diag.session('📊 Humanization analytics', {
          totalHumanizations: analyticsStats.totalHumanizations,
          uniqueFeatures: analyticsStats.uniqueFeaturesUsed,
        });
      }
    })(),

    // Personality state cleanup (turn history, previous expressions)
    (async () => {
      const { cleanupPersonalityState } = await import('./turn-handler.js');
      cleanupPersonalityState(sessionId);
    })(),

    // Prosody bridge cleanup
    (async () => {
      cleanupProsodyBridge(sessionId);
    })(),

    // Human listening
    cleanupHumanListening(sessionId),

    // Deep humanization
    cleanupDeepHumanization(sessionId),

    // Session dynamics (phase tracking)
    (async () => {
      const { cleanupSessionDynamics } =
        await import('../integrations/session-dynamics-integration.js');
      cleanupSessionDynamics(sessionId);
    })(),

    // Routing observability (log summary & cleanup)
    (async () => {
      const { logSessionRoutingSummary, cleanupSessionStats } =
        await import('../../tools/semantic-router/integration/routing-observability.js');
      logSessionRoutingSummary(sessionId);
      cleanupSessionStats(sessionId);
    })(),

    // Generate reply gateway cleanup (prevents orphaned operations after disconnect)
    (async () => {
      const { cleanupSessionState } = await import('../shared/generate-reply-gateway.js');
      cleanupSessionState(sessionId);
    })(),

    // Response Orchestrator cleanup (prevents stale SDK state tracking)
    (async () => {
      const { cleanupSession: cleanupOrchestrator } = await import('../shared/response-orchestrator.js');
      cleanupOrchestrator(sessionId);
    })(),

    // Semantic tool presence cleanup ("Better than Human" tool feedback)
    (async () => {
      const { cleanupSessionToolPresence } = await import('../../tools/execution/index.js');
      cleanupSessionToolPresence(sessionId);
    })(),

    // Tool timing context cleanup (for natural LLM response framing)
    (async () => {
      const { clearToolTimings } =
        await import('../../intelligence/context-builders/awareness/tool-timing-awareness.js');
      clearToolTimings(sessionId);
    })(),

    // Speculative persona preloading cleanup (handoff prediction state)
    (async () => {
      const { clearSpeculativeState } =
        await import('../shared/performance/speculative-preloading.js');
      clearSpeculativeState(sessionId);
    })(),

    // Session health monitor cleanup (function calling reliability - Jan 2026)
    (async () => {
      clearHealthMonitor(sessionId);
      // Also clear telemetry session (logs summary before clearing)
      clearTelemetrySession(sessionId);
    })(),

    // Semantic memory cache cleanup ("Better than Human" memory query caching)
    (async () => {
      const { clearUserSemanticCache } = await import('../../memory/semantic-memory-cache.js');
      // Clear semantic cache for this user (not session, since cache is per-user)
      if (userId) {
        clearUserSemanticCache(userId);
      }
    })(),

    // Injection builders cache cleanup (Jan 2026 optimization)
    // Clears cached health/visual/ambient/trust/insights injections for this user
    (async () => {
      if (userId) {
        clearNonVolatileInjectionCache(userId);
      }
    })(),
  ]);

  // Log any failures from service group
  serviceGroup.forEach((result, index) => {
    if (result.status === 'rejected') {
      diag.warn(`Service cleanup ${index} failed (non-fatal)`, {
        error: String(result.reason),
      });
    }
  });

  diag.session('✅ Service group complete', {
    durationMs: Date.now() - cleanupStart,
    succeeded: serviceGroup.filter((r) => r.status === 'fulfilled').length,
    failed: serviceGroup.filter((r) => r.status === 'rejected').length,
  });

  // ================================================================
  // GROUP 4: FINAL TEARDOWN (sequential, must be last)
  // ================================================================

  // End session services
  await services.endSession();

  // Reset handoff state for next session
  resetHandoffState();
  resetMetPersonas();

  // Flush optimization data
  cleanupOptimization(sessionId, patternAnalyzer, autoOptimizer, feedbackCollector);

  // Better-than-human API services cleanup
  cleanupAdvancedEmotionServices(sessionId);

  // ================================================================
  // GROUP 5: SESSION DATA MANAGER CLEANUP (clears all user caches)
  // ================================================================
  // This is CRITICAL for preventing memory leaks - cleans up ALL
  // stateful services that cache user data (ProductivityStore,
  // PersonaMemories, OutreachIntelligence, TopicTracking, etc.)
  if (userId) {
    try {
      const { getSessionDataManager } = await import('../../services/session-data-manager.js');
      const cleanupResult = await getSessionDataManager().sessionEnded(userId);
      diag.session('🧹 SessionDataManager cleanup', {
        cleaned: cleanupResult.cleaned.length,
        errors: cleanupResult.errors.length,
        services: cleanupResult.cleaned,
      });
    } catch (sdmError) {
      diag.warn('SessionDataManager cleanup failed (non-fatal)', { error: String(sdmError) });
    }
  }

  // ================================================================
  // GROUP 6: EVENT CLEANUP REGISTRY (catches any remaining handlers)
  // ================================================================
  // Final safety net - cleans up any event handlers that were
  // registered but not yet cleaned up by specific cleanup functions
  try {
    const registryResult = await runRegistryCleanup(sessionId);
    if (registryResult.cleaned > 0) {
      diag.session('🔌 Event registry cleanup', {
        cleaned: registryResult.cleaned,
        errors: registryResult.errors,
        durationMs: registryResult.totalDurationMs,
      });
    }
  } catch (registryError) {
    diag.warn('Event registry cleanup failed (non-fatal)', { error: String(registryError) });
  }

  // ================================================================
  // GROUP 7: GLOBAL SESSION REGISTRY CLEANUP
  // ================================================================
  // Clean up ALL session-scoped services that registered with the
  // global session registry (SessionIntelligence, PredictiveAnticipation,
  // ProactiveMemory, TemporalContext, CuriosityEngine, etc.)
  try {
    const { resetSessionGlobally, getGlobalRegistryStats } =
      await import('../../utils/session-registry.js');
    const statsBefore = getGlobalRegistryStats();
    const registriesWithSession = statsBefore.filter((r) => r.sessionIds.includes(sessionId));

    if (registriesWithSession.length > 0) {
      resetSessionGlobally(sessionId);
      diag.session('🗂️ Global session registry cleanup', {
        registries: registriesWithSession.map((r) => r.name),
        count: registriesWithSession.length,
      });
    }
  } catch (globalRegistryError) {
    diag.warn('Global session registry cleanup failed (non-fatal)', {
      error: String(globalRegistryError),
    });
  }

  // ================================================================
  // GROUP 8: CONTEXT BUILDER SESSION STATE CLEANUP
  // ================================================================
  // Clean up session-scoped state in context builders
  // (deep-understanding, conversational-superpowers, superhuman-insights, etc.)
  try {
    const { cleanupContextBuilderSession } =
      await import('../../intelligence/context-builders/index.js');
    await cleanupContextBuilderSession(sessionId);
    diag.session('🧠 Context builder session state cleared');
  } catch (contextBuilderError) {
    diag.warn('Context builder cleanup failed (non-fatal)', {
      error: String(contextBuilderError),
    });
  }

  // ================================================================
  // GROUP 9: SUPERHUMAN ENGINE CLEANUP (per-user state)
  // ================================================================
  // Clean up superhuman conversation engines (evolving jokes, emotional memory,
  // linguistic mirroring, vulnerability matching, etc.)
  if (userId) {
    try {
      const { clearAllSuperhumanEngines } = await import('../../conversation/superhuman/index.js');
      clearAllSuperhumanEngines(userId, sessionId);
      diag.session('✨ Superhuman engines cleared', { userId });
    } catch (superhumanError) {
      diag.warn('Superhuman engine cleanup failed (non-fatal)', {
        error: String(superhumanError),
      });
    }
  }

  const totalDuration = Date.now() - cleanupStart;
  diag.session('✅ Session cleanup complete', { totalDurationMs: totalDuration });
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

async function cleanupDJIntegration(_services: SessionServices): Promise<void> {
  try {
    const djController = getDJController();

    // Get session state for logging
    const state = djController.getState();

    // Log DJ session summary
    diag.session('🎧 DJ session summary', {
      finalState: state.state,
      hadMusic: state.currentTrack !== null || state.trackStartTime !== null,
      wasExplicitlyStopped: state.wasExplicitlyStopped,
    });

    // Music preferences are now handled by music-user-learning.ts
    // No need to extract from DJ Booth since it's been deleted
    const djBoothPrefs: {
      likedArtists?: string[];
      dislikedArtists?: string[];
      favoriteGenres?: string[];
      moodPreferences?: Record<string, string[]>;
      preferredMusicTimes?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
    } | null = null;

    // Music preferences are now persisted via music-learning-persistence.ts
    // The music-user-learning.ts module handles Thompson Sampling for preferences
    // and music-memory-integration.ts handles music helped memories
    // No manual preference merging needed here - it's all automatic now!
    
    diag.session('🎧 DJ Controller cleanup complete');
  } catch (djErr) {
    diag.warn('🎧 DJ summary save failed (non-fatal)', { error: String(djErr) });
  }
}

function cleanupDJBooth(): void {
  try {
    resetDJController();
    resetDJTimingEngine();
    diag.session('🎧 DJ Controller cleaned up');
  } catch (boothErr) {
    diag.warn('🎧 DJ Controller cleanup failed (non-fatal)', { error: String(boothErr) });
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

async function cleanupRelationshipMemory(
  userId: string,
  personaId: string,
  sessionId: string
): Promise<void> {
  try {
    const { getRelationshipEngine } = await import('../../intelligence/relationship/index.js');
    const { clearSessionCallbackCount } = await import(
      '../../intelligence/context-builders/relationship/callback-opportunities.js'
    );
    const { getConversationState } = await import('../../services/conversation-state.js');

    // Get the relationship engine for this session
    const engine = getRelationshipEngine(userId, personaId);
    if (engine) {
      // Get actual session mood and topics from conversation state
      // SessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis'
      let sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis' = 'neutral';
      let topics: string[] = [];

      try {
        const convState = getConversationState(sessionId);
        if (convState) {
          // Map sentiment to session mood
          // Sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
          // SessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis'
          const sentiment = convState.getEmotionalContext().sentiment;
          if (sentiment === 'positive') {
            sessionMood = 'positive';
          } else if (sentiment === 'negative') {
            sessionMood = 'struggling';
          } else {
            sessionMood = 'neutral';
          }

          // Extract topics from topic history
          const topicContext = convState.getTopicContext();
          topics = topicContext.history
            .map((t) => t.topic)
            .filter((t): t is string => t !== null)
            .slice(-10); // Keep last 10 topics

          // Add current topic if present
          if (topicContext.current && !topics.includes(topicContext.current)) {
            topics.push(topicContext.current);
          }
        }
      } catch (stateErr) {
        // Conversation state may not exist or be accessible - use defaults
        diag.debug('Could not get conversation state for relationship memory', {
          error: String(stateErr),
        });
      }

      // End session and persist relationship memory
      await engine.endSession(sessionMood, topics);
      diag.session('💕 Relationship memory saved', {
        userId,
        personaId,
        stage: engine.stage,
        sessions: engine.sessions,
        trust: engine.trust,
        mood: sessionMood,
        topicsCount: topics.length,
      });
    }

    // Clear session callback counts
    clearSessionCallbackCount(userId, sessionId);
  } catch (relErr) {
    diag.warn('Relationship memory save failed (non-fatal)', { error: String(relErr) });
  }
}

async function cleanupDeepUnderstandingProfiles(userId: string, sessionId: string): Promise<void> {
  try {
    await saveDeepUnderstandingProfiles(userId);
    diag.session('Deep understanding profiles saved', { userId });
  } catch (deepErr) {
    diag.warn('Deep understanding profile save failed (non-fatal)', { error: String(deepErr) });
  }

  // Flush collective learning signals
  try {
    const flushed = await flushLearningSignals();
    if (flushed.responses > 0 || flushed.stories > 0 || flushed.breakthroughs > 0) {
      diag.session('📊 Collective learning signals flushed', flushed);
    }
  } catch (learningErr) {
    diag.warn('Collective learning flush failed (non-fatal)', { error: String(learningErr) });
  }

  // NEW: Clean up unified intelligence (context assembler, correlator, proactive engine)
  try {
    cleanupIntelligenceSession(userId, sessionId);
    diag.session('Unified intelligence cleaned up', { userId, sessionId });
  } catch (intErr) {
    diag.warn('Unified intelligence cleanup failed (non-fatal)', { error: String(intErr) });
  }
}

async function cleanupCapabilityLearning(userId: string, sessionId: string): Promise<void> {
  try {
    const sessionKey = `${userId}-${sessionId}`;
    await finalizeSessionLearning(sessionKey, userId);
    diag.session('📚 Capability learning finalized', { userId, sessionId });
  } catch (capErr) {
    diag.warn('Capability learning cleanup failed (non-fatal)', { error: String(capErr) });
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
      const { shutdownSpotify } = await import('../../tools/domains/entertainment/spotify.js');
      shutdownSpotify();
      const { resetMusicPlayer } = await import('../../audio/index.js');
      // 🐛 FIX: Await the async resetMusicPlayer to prevent race conditions
      await resetMusicPlayer();
      diag.session('Spotify and music player reset');
    }
  } catch (e) {
    log().debug({ error: String(e) }, 'Music cleanup failed (non-fatal)');
  }
}

async function cleanupGames(sessionId: string): Promise<void> {
  try {
    const { getSessionGameEngine, resetSessionGameEngine } =
      await import('../../services/games/index.js');
    const engine = getSessionGameEngine(sessionId);
    await engine.flushToStorage();
    resetSessionGameEngine(sessionId);
    diag.session('Game engine flushed and reset');
  } catch (e) {
    log().debug({ error: String(e) }, 'Game cleanup failed (non-fatal)');
  }
}

function cleanupOptimization(
  sessionId: string,
  patternAnalyzer?: { endSession: (sessionId: string) => void },
  autoOptimizer?: { endSession: (sessionId: string) => void },
  feedbackCollector?: { flush: () => Promise<void> }
): void {
  try {
    patternAnalyzer?.endSession(sessionId);
    autoOptimizer?.endSession(sessionId);
    if (feedbackCollector) void feedbackCollector.flush();
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
    // Only clear the context builder result - the speech pipeline is already
    // cleaned up by cleanupSpeechSession() in STEP 7
    const { clearHumanListeningResult } =
      await import('../../intelligence/context-builders/emotional/human-listening.js');
    clearHumanListeningResult(sessionId);
    diag.session('🎧 Human listening context cleared');
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
      await import('../../intelligence/context-builders/humanization/deep-humanization.js');
    cleanup(sessionId);
    diag.session('🎭 Deep humanization session cleaned up');
  } catch (deepHumanCleanupErr) {
    diag.warn('Deep humanization cleanup failed (non-fatal)', {
      error: String(deepHumanCleanupErr),
    });
  }
}

export default handleSessionCleanup;
