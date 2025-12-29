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
import {
  flushLearningSignals,
  onDeepUnderstandingSessionEnd as saveDeepUnderstandingProfiles,
} from '../../intelligence/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { emitConversationEnd } from '../../services/async-events/index.js';
import { onCognitiveSessionEnd } from '../../services/cognitive-session-hooks.js';
import { endConversation as endConversationState } from '../../services/conversation-state.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { onSessionEnd as saveTrustProfiles } from '../../services/trust-systems/index.js';
import { recordSessionEnd as recordUserSessionEnd } from '../../services/analytics/user-analytics.js';
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
import { getDJIntegration } from '../dj-integration.js';
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

// Capability learning - track which capabilities resonated
import { finalizeSessionLearning } from '../../intelligence/capability-learning.js';
import { clearSession as clearHumeSession } from '../../services/emotion-analysis/hume.js';

// FIX AUDIT: Import seed economy from service layer (clean architecture)
import { awardSeedsForConversation } from '../../services/seed-economy.js';

// Session closing tracker - prevents operations during shutdown
import { markSessionClosing, clearSessionClosing } from '../shared/session-closing-tracker.js';

// Event cleanup registry for tracking and cleaning up event handlers
import { runSessionCleanup as runRegistryCleanup } from '../session/event-cleanup-registry.js';

// Action history cleanup - for honesty guardrail tracking
import { clearSessionHistory } from '../shared/action-history.js';

// FinOps cost tracking
import { finops } from '../../services/observability/finops.js';

// Relationship Arc - Better Than Human relationship progression
import { incrementSessionStats } from '../../intelligence/context-builders/relationship-arc/storage.js';
// Resilience metrics
import { resilienceMetrics } from '../../services/observability/resilience-metrics.js';

// FIX AUDIT: Import proper types for event handlers instead of using `any`
import type { HandoffEventPayload } from '../shared/handoff/types.js';

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
  musicCleanup?: () => void;
  // User data for trial tracking
  userData?: UserDataWithTrial;
  // Periodic sync cleanup
  stopPeriodicSync?: (() => void) | null;
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
  } = ctx;

  try {
    // ================================================================
    // GROUP 1: SYNCHRONOUS EVENT LISTENER CLEANUP (immediate, prevents memory leaks)
    // ================================================================
    if (dataChannelCleanup) dataChannelCleanup();
    if (handoffHandler) handoffEvents.off('voiceSwitch', handoffHandler);
    if (cameoUnlockHandler) cameoUnlockEvents.off('memberUnlocked', cameoUnlockHandler);
    if (cameoCleanup) cameoCleanup();
    if (stopPeriodicSync) stopPeriodicSync();

    // Clear action history (for honesty guardrail - prevents memory bloat)
    clearSessionHistory(sessionId);

    // End conversation state (needed for data below)
    const finalConvState = endConversationState(sessionId);
    if (finalConvState) {
      diag.session('Conversation state ended', {
        turnCount: finalConvState.flow.turnCount,
        durationMinutes: finalConvState.flow.durationMinutes,
      });
    }

    const sessionDurationMs = services?.sessionStartTime
      ? Date.now() - services.sessionStartTime
      : 0;

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
    // GROUP 2: PARALLEL DATA PERSISTENCE (independent, can run together)
    // ================================================================
    const persistenceGroup = await Promise.allSettled([
      // Cognitive session
      cleanupCognitiveSession(userId, sessionPersona.id, sessionId, services),

      // Trust profiles
      userId ? cleanupTrustProfiles(userId) : Promise.resolve(),

      // Deep understanding profiles
      userId ? cleanupDeepUnderstandingProfiles(userId, sessionId) : Promise.resolve(),

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
            const topicStr = typeof finalConvState?.topic === 'string' 
              ? finalConvState.topic 
              : 'general topics';
            
            await storeSessionSummary({
                sessionId,
                userId,
                startedAt: startTime,
                endedAt: new Date(),
                durationSeconds: Math.round(sessionDurationMs / 1000),
                personasEngaged: [sessionPersona?.id || 'ferni'],
                mainTopics: topicStr !== 'general topics' ? [topicStr] : [],
                naturalSummary: `Conversation about ${topicStr}`,
                insightsGenerated: [], // TODO: Collect from turn processor
                unfinishedTopics: [], // TODO: Detect unfinished topics
                commitmentsMade: [], // TODO: Extract from commitments tracker
                emotionalArc: [], // TODO: Collect from emotional state
                endingEmotionalState: finalConvState?.emotional?.sentiment || 'neutral',
                wasSignificant: turnCount >= 5 || sessionDurationMs >= 5 * 60 * 1000,
                significanceScore: Math.min(1, (turnCount * 0.1) + (sessionDurationMs / (30 * 60 * 1000))),
              });
              diag.session('📱 Session summary stored for app sync', { userId, turnCount });
            } catch (err) {
              diag.warn('Session summary storage failed (non-fatal)', { error: String(err) });
            }
          })()
        : Promise.resolve(),

      // Personality resonance - flush to Firestore
      userId
        ? (async () => {
            const { flushResonanceProfile } =
              await import('../../personas/bundles/ferni/personality-resonance-store.js');
            await flushResonanceProfile(userId);
            diag.session('🎭 Personality resonance profile persisted');
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

      // Session-scoped state cleanup
      (async () => {
        const { clearHandoffSessionState } = await import('../shared/handoff/session-state.js');
        clearHandoffSessionState(sessionId);
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

      // Music cleanup
      (async () => {
        if (musicCleanup) musicCleanup();
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

      // Semantic tool presence cleanup ("Better than Human" tool feedback)
      (async () => {
        const { cleanupSessionToolPresence } = await import('../../tools/execution/index.js');
        cleanupSessionToolPresence(sessionId);
      })(),

      // Tool timing context cleanup (for natural LLM response framing)
      (async () => {
        const { clearToolTimings } =
          await import('../../intelligence/context-builders/tool-timing-context.js');
        clearToolTimings(sessionId);
      })(),

      // Speculative persona preloading cleanup (handoff prediction state)
      (async () => {
        const { clearSpeculativeState } =
          await import('../shared/performance/speculative-preloading.js');
        clearSpeculativeState(sessionId);
      })(),

      // Semantic memory cache cleanup ("Better than Human" memory query caching)
      (async () => {
        const { clearUserSemanticCache } = await import('../../memory/semantic-memory-cache.js');
        // Clear semantic cache for this user (not session, since cache is per-user)
        if (userId) {
          clearUserSemanticCache(userId);
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
        const { clearAllSuperhumanEngines } =
          await import('../../conversation/superhuman/index.js');
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
  } catch (error) {
    // Re-throw to let the timeout wrapper handle it
    throw error;
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

    // 🎧 Play exit sound as backup (may have already played during goodbye)
    // This ensures the sound plays even if the session ends abruptly
    try {
      const wrapResult = await dj.wrapShow();
      if (wrapResult.playedSound) {
        diag.session('🎧 Session wrap sound played (cleanup)', { playedSound: true });
      }
    } catch (wrapErr) {
      diag.debug('Session wrap sound skipped (may have already played)', {
        error: String(wrapErr),
      });
    }

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
      await import('../../intelligence/context-builders/human-listening.js');
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
