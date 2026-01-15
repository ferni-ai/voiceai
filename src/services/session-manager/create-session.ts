/**
 * Session Manager
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Handles creation and lifecycle of per-conversation sessions.
 * Each session gets its own set of services and state.
 *
 * Every session is a new opportunity to connect with someone as a real person,
 * not just another API call. We maintain context, remember history, and bring
 * genuine continuity to each conversation.
 *
 * @see ./session-manager/cleanup.ts - Session cleanup/TTL management
 * @see ./session-manager/constants.ts - Configuration constants
 * @see ./session-manager/validation.ts - User ID validation
 */

import type { SpeechCharacteristics } from '../../personas/types.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

const log = getLogger();
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// Extracted session-manager modules
import {
  clearAllSessions as clearAll,
  getActiveSessionCount as getActiveCount,
  getActiveSessionIds as getActiveIds,
  getSessionServices as getSession,
  initializeAccess,
} from './access.js';
import {
  initializeCleanup,
  startSessionCleanup as startCleanup,
  stopSessionCleanup as stopCleanup,
} from './cleanup.js';
import { MAX_HUMANIZING_UPDATES, SUMMARIZE_TIMEOUT_MS } from './constants.js';
import { withTimeout } from './utils.js';
import { validateUserId } from './validation.js';

// Real-time memory - persist turns as they happen, never lose data
import * as realtimeMemory from '../memory/realtime-memory.js';

// Voice authentication - household identification
import { getActiveSession, startHouseholdSession } from '../voice/voice-household.js';

// Cross-persona insights - load team intelligence for new sessions
import { loadInsights as loadCrossPersonaInsights } from '../cross-persona/cross-persona-insights.js';

// Unified persistence - session lifecycle hooks
import { onSessionEndUnified, onSessionStartUnified } from '../trust-systems/unified-persistence.js';

// Memory imports
import {
  // Advanced memory retrieval for session priming
  buildMemoryIndex,
  clearCurrentSessionMomentsGetter,
  getConversationPrimingMemories,
  getHistoryTracker,
  // Session priming for cross-session continuity
  getSessionPrimer,
  indexConversationSummary,
  removeHistoryTracker,
  ragLookup as semanticRagLookup,
  semanticSearch,
  setCurrentSessionMomentsGetter,
  summarizeConversation,
  type ConversationTurn,
} from '../../memory/index.js';

// Intelligence imports
import {
  analyzeMessage,
  // Superhuman Memory - "Better than Human" proactive intelligence
  buildSuperhumanContext,
  getCommunicationMirroring,
  getConversationPatternAnalyzer,
  getCrossSessionThreader,
  getEmotionalMemory,
  getEmotionDetector,
  getFinancialJourneyTracker,
  // Human-Level Interaction Engines
  getHumorCalibration,
  getLearningEngine,
  getProactiveInsightEngine,
  // Advanced Intelligence Engines
  getResponseQualityTracker,
  getStateMachine,
  getStoryPreference,
  getTopicTracker,
  getVoicePaceAdapter,
  markSuperhumanInsightDelivered as markSuperhumanInsightDeliveredFn,
  recordVoicePattern,
  removeCommunicationMirroring,
  removeConversationPatternAnalyzer,
  removeCrossSessionThreader,
  removeEmotionalMemory,
  removeFinancialJourneyTracker,
  removeHumorCalibration,
  removeProactiveInsightEngine,
  removeResponseQualityTracker,
  removeStoryPreference,
  removeVoicePaceAdapter,
  resetIntelligence,
  resetLearningEngine,
  UserLearningEngine,
  type SuperhumanContext,
} from '../../intelligence/index.js';

// Context imports
import { getContextManager, removeContextManager } from '../../context/index.js';

// Speech imports - using session-scoped WPM tracking
import {
  buildSpeechContext,
  getSessionWPMTracker,
  tagAdvice,
  tagStory,
  tagSupportResponse,
  tagTextWithSsmlAdaptive,
  tagWrapUp,
} from '../../speech/index.js';

// Local imports
import { getGlobalServices } from '../global-services.js';
import type { HumanizingStateUpdate } from './humanizing-state.js';
import { getPersonalizer } from '../coaching/profile-personalizer.js';
import type { CreateSessionOptions, SessionServices } from '../types.js';

// Handoff state (per-session, not global)
import { createHandoffState, initializeFromPersistedData } from '../handoff/handoff-state.js';

// Intelligence persistence - unified save/load for all learning engines
import {
  applyIntelligenceToProfile,
  cleanupIntelligenceEngines,
  loadIntelligenceFromProfile,
  startAutoSave,
  stopAutoSave,
} from '../cross-persona/intelligence-persistence.js';

// Persistence metrics for observability
import { persistenceMetrics } from '../analytics/persistence-metrics.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// ============================================================================
// SESSION STATE
// ============================================================================

const activeSessions = new Map<string, SessionServices>();

// Initialize extracted modules with reference to active sessions
// Cast needed: access module expects branded SessionId but we use string internally
initializeCleanup(activeSessions);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
initializeAccess(activeSessions as any);

/**
 * Start periodic cleanup of orphaned sessions
 * Sessions older than SESSION_MAX_AGE_MS are automatically ended
 */
export function startSessionCleanup(): void {
  startCleanup();
}

/**
 * Stop periodic session cleanup (for shutdown)
 */
export function stopSessionCleanup(): void {
  stopCleanup();
}

// ============================================================================
// SESSION CREATION
// ============================================================================

/**
 * Create session services for a new conversation
 */

export async function createSessionServices(
  sessionId: string,
  userId?: string,
  isReturningUser?: boolean,
  personaSpeech?: SpeechCharacteristics,
  personaEnergy?: number,
  personaId?: string
): Promise<SessionServices>;

// eslint-disable-next-line no-redeclare
export async function createSessionServices(
  options: CreateSessionOptions
): Promise<SessionServices>;

// eslint-disable-next-line no-redeclare
export async function createSessionServices(
  sessionIdOrOptions: string | CreateSessionOptions,
  userId?: string,
  isReturningUser?: boolean,
  personaSpeech?: SpeechCharacteristics,
  personaEnergy?: number,
  personaId?: string
): Promise<SessionServices> {
  // Handle both calling conventions
  let sessionId: string;
  let userName: string | undefined;
  if (typeof sessionIdOrOptions === 'object') {
    sessionId = sessionIdOrOptions.sessionId;
    userId = sessionIdOrOptions.userId;
    userName = sessionIdOrOptions.userName;
    isReturningUser = sessionIdOrOptions.isReturningUser;
    personaSpeech = sessionIdOrOptions.personaSpeech;
    personaEnergy = sessionIdOrOptions.personaEnergy;
    personaId = sessionIdOrOptions.personaId;
  } else {
    sessionId = sessionIdOrOptions;
  }

  getLogger().info(`Creating session services: ${sessionId} (user: ${userId || 'unknown'})`);

  // Ensure global services are initialized
  const global = await getGlobalServices();

  // Track last detected user emotion for voice tone matching
  let lastUserEmotion: string | undefined = undefined;

  // Track humanizing state updates during session
  const humanizingStateUpdates: HumanizingStateUpdate[] = [];

  // ============================================================================
  // 🚀 FAST SESSION INIT: Only load profile synchronously, everything else is background
  // OLD: Sequential waterfall (~500-800ms) - profile → context → intelligence → insights → social
  // NEW: Parallel (~100-200ms) - profile only blocking, rest in background
  // ============================================================================

  let userProfile: UserProfile | null = null;
  const validatedUserId = validateUserId(userId);

  if (validatedUserId) {
    // ⚡ PERFORMANCE: Use Redis-backed profile cache for faster session start
    // Cache hit: ~5-20ms vs Firestore: ~100-500ms
    const { getProfileWithCache, cacheProfile, invalidateProfile } =
      await import('./data-layer/profile-cache.js');

    // BLOCKING: Load profile with cache-through pattern (Redis → Firestore)
    userProfile = await getProfileWithCache(validatedUserId, async (uid) => {
      return global.store.getProfile(uid);
    });

    if (!userProfile) {
      const { createUserProfile } = await import('../types/user-profile.js');
      // CRITICAL: Pass userName from onboarding so Ferni remembers their name!
      userProfile = createUserProfile(validatedUserId, userName);
      await global.store.saveProfile(userProfile);
      // Cache the new profile
      void cacheProfile(validatedUserId, userProfile);
      getLogger().info(
        { userId: validatedUserId, name: userName || '(none)' },
        '🆕 Created new user profile with name from onboarding'
      );
    } else if (!userProfile.name && userName) {
      // Existing profile without a name, but we now have one - update it!
      userProfile.name = userName;
      await global.store.saveProfile(userProfile);
      // Invalidate cache so next session gets updated profile
      void invalidateProfile(validatedUserId);
      getLogger().info(
        { userId: validatedUserId, name: userName },
        '✨ Updated existing profile with name from onboarding'
      );
    }
    isReturningUser = userProfile.totalConversations > 0;

    // NON-BLOCKING: Start intelligent loader for on-demand domain loading
    import('./data-layer/intelligent-loader.js')
      .then(({ getIntelligentLoader }) => {
        const loader = getIntelligentLoader(validatedUserId, sessionId);
        loader.initializeSession().catch(() => {
          // Non-critical - domains load on-demand anyway
        });
      })
      .catch(() => {
        // Module load failure - non-critical
      });

    // NON-BLOCKING: Background enrichment tasks (fire and forget)
    if (isReturningUser) {
      // Load intelligence state in background
      // Use setTimeout(0) for compatibility with ESLint no-undef rule for setImmediate
      setTimeout(() => {
        try {
          loadIntelligenceFromProfile(validatedUserId, userProfile!);
          getLogger().debug(
            { userId: validatedUserId },
            '🧠 Intelligence state loaded (background)'
          );
        } catch {
          // Non-critical
        }
      }, 0);

      // Enrich with realtime memory context (background)
      realtimeMemory
        .getLastConversationContext(validatedUserId)
        .then((lastContext) => {
          if (lastContext && userProfile && !userProfile.lastConversationSummary) {
            const summary =
              lastContext.summary || realtimeMemory.buildQuickSummary(lastContext.turns);
            if (summary) userProfile.lastConversationSummary = summary;
          }
        })
        .catch(() => {
          /* Non-critical */
        });

      // Load cross-persona insights (background)
      loadCrossPersonaInsights(validatedUserId).catch(() => {
        /* Non-critical */
      });

      // Load social graph (background)
      import('./social-graph/index.js')
        .then(async ({ loadGraphFromFirestore }) => loadGraphFromFirestore(validatedUserId))
        .catch(() => {
          /* Non-critical */
        });

      // Initialize trust persistence (background)
      onSessionStartUnified(validatedUserId, sessionId).catch(() => {
        /* Non-critical */
      });

      // Pre-warm embeddings (background)
      import('../agents/shared/performance/session-optimizations.js')
        .then(async ({ optimizeSessionStart }) => optimizeSessionStart(sessionId, validatedUserId))
        .catch(() => {
          /* Non-critical */
        });
    }
  } else if (userId) {
    getLogger().warn(
      { providedUserId: userId?.slice(0, 20) },
      'Skipping profile operations due to invalid userId'
    );
  }

  // Create session-specific components
  const historyTracker = getHistoryTracker(sessionId, userId);
  const contextManager = getContextManager(sessionId, userProfile || undefined);

  // Reset intelligence and tasks for new session
  resetIntelligence(isReturningUser);
  // Note: WPM tracking is now session-scoped via getSessionWPMTracker(sessionId)
  resetLearningEngine();

  // Get learning engine for this session
  const learningEngine = getLearningEngine();

  // Reset task manager
  const { resetTaskManager, getTaskManager } = await import('../tasks/task-manager.js');
  resetTaskManager();
  const taskManager = getTaskManager();

  // Get state machine with returning user flag
  const stateMachine = getStateMachine(isReturningUser);

  // Get personalizer for profile-based enhancements
  const personalizer = getPersonalizer();

  // Wire up real-time key moment retrieval from current session
  setCurrentSessionMomentsGetter(() => learningEngine.getCurrentSessionKeyMoments());

  // ============================================================================
  // HANDOFF STATE (per-session to prevent cross-session contamination)
  // ============================================================================

  // Determine initial agent - use personaId if provided, otherwise default to 'ferni'
  const initialAgent = (personaId || 'ferni') as import('../services/agent-bus.js').AgentId;
  const handoffState = createHandoffState(initialAgent);

  // Initialize from user profile if available (for returning users)
  if (userProfile?.customData) {
    const customData = userProfile.customData as {
      meetingCounts?: Record<string, number>;
      lastTopicsPerPersona?: Record<string, string>;
    };
    if (customData.meetingCounts || customData.lastTopicsPerPersona) {
      initializeFromPersistedData(handoffState, {
        meetingCounts: customData.meetingCounts,
        lastTopics: customData.lastTopicsPerPersona,
      });
      getLogger().info('Loaded handoff state from user profile');
    }
  }

  // ============================================================================
  // ADVANCED INTELLIGENCE ENGINES
  // ============================================================================

  const engineKey = userId || sessionId;

  const responseQualityTracker = getResponseQualityTracker(engineKey);
  const patternAnalyzer = getConversationPatternAnalyzer(engineKey);
  const proactiveEngine = getProactiveInsightEngine(engineKey);
  const journeyTracker = getFinancialJourneyTracker(engineKey);
  const voicePaceAdapter = getVoicePaceAdapter(engineKey);

  // ============================================================================
  // HUMAN-LEVEL INTERACTION ENGINES
  // ============================================================================

  const humorCalibration = getHumorCalibration(engineKey);
  const storyPreference = getStoryPreference(engineKey);
  const communicationMirroring = getCommunicationMirroring(engineKey);
  const emotionalMemory = getEmotionalMemory(engineKey);

  // Start emotional memory session
  emotionalMemory.startSession(sessionId);

  // Load emotional memory from profile for returning users
  if (userProfile?.customData && isReturningUser) {
    const customData = userProfile.customData as {
      emotionalMoments?: Array<
        import('../intelligence/tracking/emotional-memory.js').EmotionalMoment
      >;
    };
    if (customData.emotionalMoments?.length) {
      emotionalMemory.importMoments(customData.emotionalMoments);
      getLogger().info(
        { count: customData.emotionalMoments.length },
        'Loaded emotional memory from profile'
      );
    }
  }

  // ============================================================================
  // CROSS-SESSION THREADER (with persistence from user profile)
  // FIX: Load existing threads and follow-ups for returning users
  // ============================================================================

  let existingThreads:
    | Array<import('../intelligence/tracking/cross-session.js').OpenThread>
    | undefined;
  let existingFollowUps:
    | Array<import('../intelligence/tracking/cross-session.js').PromisedFollowUp>
    | undefined;

  if (userProfile?.customData && isReturningUser) {
    const customData = userProfile.customData as {
      openThreads?: Array<import('../intelligence/tracking/cross-session.js').OpenThread>;
      promisedFollowUps?: Array<
        import('../intelligence/tracking/cross-session.js').PromisedFollowUp
      >;
    };

    existingThreads = customData.openThreads;
    existingFollowUps = customData.promisedFollowUps;

    if (existingThreads?.length || existingFollowUps?.length) {
      getLogger().info(
        {
          openThreads: existingThreads?.filter((t) => t.status === 'open').length || 0,
          pendingFollowUps: existingFollowUps?.filter((f) => !f.delivered).length || 0,
        },
        'Loaded cross-session threads from user profile'
      );
    }
  }

  const crossSessionThreader = getCrossSessionThreader(
    engineKey,
    existingThreads,
    existingFollowUps
  );

  // Set current session ID for thread tracking
  crossSessionThreader.setCurrentSession(sessionId);

  // ============================================================================
  // SESSION PRIMING (for returning users)
  // Generate natural openers and surface relevant context for "better than human" continuity
  // ============================================================================

  let sessionPriming: SessionServices['sessionPriming'];
  if (userProfile && isReturningUser && validatedUserId) {
    try {
      const primer = getSessionPrimer();

      // Get recent conversation summaries for context
      const recentSummaries = userProfile.conversationSummaries?.slice(-5) || [];

      // ========================================================================
      // MEMORY INDEX WARMING - Build index at session START for returning users
      // This ensures semantic retrieval works from turn 1, not just after indexing
      // ========================================================================
      let primingMemories: Array<import('../memory/advanced-retrieval.js').MemoryItem> = [];
      try {
        // Build memory index from user profile (fast if already built)
        buildMemoryIndex(validatedUserId, userProfile);

        // Get salient memories for session priming (commitments, emotional moments, recent topics)
        primingMemories = getConversationPrimingMemories(validatedUserId, personaId || 'ferni', {
          maxMemories: 5,
          includeCommitments: true,
          includeRecentTopics: true,
          sessionCount: userProfile.totalConversations || 0,
        });

        if (primingMemories.length > 0) {
          getLogger().info(
            { userId: validatedUserId, memoriesLoaded: primingMemories.length },
            '🧠 Memory index warmed with salient memories for session priming'
          );
        }
      } catch (memoryWarmupError) {
        getLogger().debug(
          { error: String(memoryWarmupError) },
          'Memory warmup failed (non-blocking) - continuing with empty memories'
        );
      }

      // Generate priming context with actual memories from vector store
      const primingResult = await primer.generatePrimingContext(
        userProfile,
        primingMemories, // Now populated with real memories!
        recentSummaries
      );

      sessionPriming = {
        suggestedOpener: primingResult.suggestedOpener,
        openThreads: primingResult.openThreads.map((t: { topic: string; priority: string }) => ({
          topic: t.topic,
          urgency: t.priority as 'high' | 'medium' | 'low',
        })),
        pendingFollowUps: primingResult.pendingFollowUps.map(
          (f: { commitment: string; dueDate?: Date }) => ({
            topic: f.commitment,
            dueDate: f.dueDate?.toISOString(),
          })
        ),
        emotionalContext: primingResult.emotionalContext
          ? {
              trend: primingResult.emotionalContext.sessionEndState,
              lastEmotion: primingResult.emotionalContext.lastSessionMood,
            }
          : undefined,
        relationshipContext: primingResult.relationshipContext
          ? {
              stage: primingResult.relationshipContext.relationshipStage,
              sessionsCount: primingResult.relationshipContext.sessionCount,
            }
          : undefined,
        naturalGreetingHints: primingResult.emotionalContext?.carePoints || [],
      };

      getLogger().info(
        {
          openThreads: sessionPriming.openThreads.length,
          pendingFollowUps: sessionPriming.pendingFollowUps.length,
          suggestedOpenerPreview: sessionPriming.suggestedOpener.slice(0, 50),
        },
        '🎯 Session priming generated for returning user'
      );
    } catch (primingError) {
      getLogger().debug(
        { error: String(primingError) },
        'Failed to generate session priming (non-blocking)'
      );
    }
  }

  // ============================================================================
  // PROACTIVE INSIGHTS GENERATION (for returning users)
  // Generate proactive check-ins based on user history
  // ============================================================================

  if (userProfile && isReturningUser) {
    try {
      const patternData = patternAnalyzer.analyzePatterns();
      const responsePrefs = responseQualityTracker.calculatePreferences();

      const insightResult = proactiveEngine.generateInsights(
        userProfile,
        patternData,
        responsePrefs
      );

      if (insightResult.highPriorityCount > 0) {
        getLogger().info(
          {
            totalInsights: insightResult.insights.length,
            highPriority: insightResult.highPriorityCount,
            suggestedStarter: insightResult.suggestedConversationStarter?.slice(0, 50),
          },
          'Generated proactive insights for returning user'
        );
      }
    } catch (insightError) {
      getLogger().debug(
        { error: String(insightError) },
        'Failed to generate proactive insights (non-blocking)'
      );
    }
  }

  // ============================================================================
  // SUPERHUMAN MEMORY CONTEXT - "Better than Human" proactive intelligence
  // Surfaces important dates, comfort patterns, growth celebrations, etc.
  // ============================================================================

  let superhumanContext: SuperhumanContext | undefined;
  if (userProfile && isReturningUser) {
    try {
      superhumanContext = buildSuperhumanContext(userProfile, {
        sessionCount: userProfile.totalConversations || 0,
        recentTopics: userProfile.preferredTopics || [],
      });

      if (superhumanContext.insights.length > 0) {
        getLogger().info(
          {
            insights: superhumanContext.insights.length,
            highPriority: superhumanContext.insights.filter((i) => i.priority === 'high').length,
            hasDateReminder: superhumanContext.insights.some((i) => i.type === 'date_reminder'),
            hasGrowthCelebration: superhumanContext.insights.some(
              (i) => i.type === 'growth_celebration'
            ),
            comfortGuidance: superhumanContext.comfortGuidance.stressLevel !== 'none',
            topicAbsences: superhumanContext.topicAbsences.length,
          },
          '🧠 SUPERHUMAN: Generated "Better than Human" memory context'
        );
      }
    } catch (superhumanError) {
      getLogger().debug(
        { error: String(superhumanError) },
        'Failed to generate superhuman memory context (non-blocking)'
      );
    }
  }

  // Wire task manager to capture insights for learning
  taskManager.setInsightCallback((type, key, value, confidence) => {
    learningEngine.captureExternalInsight({
      type: type as
        | 'preference'
        | 'concern'
        | 'goal'
        | 'relationship'
        | 'communication_style'
        | 'topic_interest'
        | 'emotional_pattern',
      key,
      value,
      confidence,
      source: 'inferred',
    });
  });

  getLogger().info('Advanced intelligence engines initialized');

  // ============================================================================
  // AUTO-SAVE SETUP
  // FIX: Start periodic auto-save to prevent data loss on crashes
  // ============================================================================

  if (validatedUserId) {
    const autoSaveCallback = async (uid: string) => {
      const startTime = Date.now();
      try {
        if (services.userProfile) {
          // Export current intelligence state
          const updatedProfile = applyIntelligenceToProfile(services.userProfile, uid);
          services.userProfile = updatedProfile;

          // Save to store
          await global.store.saveProfile(updatedProfile);

          const durationMs = Date.now() - startTime;
          persistenceMetrics.recordAutoSave(sessionId, durationMs);
          getLogger().debug(
            { userId: uid, durationMs },
            'Auto-saved profile with intelligence state'
          );
        }
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);
        persistenceMetrics.recordAutoSave(sessionId, durationMs, errorMsg);
        getLogger().warn({ error, userId: uid }, 'Auto-save failed');
      }
    };

    // Start auto-save with 30 second interval
    startAutoSave(validatedUserId, autoSaveCallback, { autoSaveIntervalMs: 30000 });
    getLogger().info({ userId: validatedUserId }, '⏰ Started auto-save for session');

    // Record session start in metrics
    persistenceMetrics.recordSessionStart(sessionId, validatedUserId, personaId || 'unknown');
  }

  // ============================================================================
  // REALTIME MEMORY - NEVER LOSE A CONVERSATION
  // Starts a Firestore conversation and persists each turn as it happens
  // ============================================================================

  let realtimeConversationId: string | undefined;
  if (validatedUserId) {
    try {
      realtimeConversationId = await realtimeMemory.startConversation(
        validatedUserId,
        personaId || 'ferni'
      );
      getLogger().info(
        { userId: validatedUserId, conversationId: realtimeConversationId },
        '🔴 REALTIME: Conversation started - every turn will be persisted immediately'
      );
    } catch (error) {
      getLogger().warn(
        { error: String(error), userId: validatedUserId },
        'Failed to start realtime conversation (falling back to session-end persistence)'
      );
    }
  }

  // ============================================================================
  // HOUSEHOLD SESSION TRACKING
  // Start household session for multi-user identification
  // ============================================================================

  if (validatedUserId) {
    try {
      // Start or resume household session
      const existingSession = getActiveSession(sessionId);
      if (!existingSession) {
        startHouseholdSession(sessionId, validatedUserId);
        getLogger().info(
          { sessionId, userId: validatedUserId },
          '👥 Household session started for voice identification'
        );
      }
    } catch (error) {
      getLogger().warn(
        { error: String(error) },
        'Failed to start household session (voice identification unavailable)'
      );
    }
  }

  // ============================================================================
  // SESSION SERVICES OBJECT
  // ============================================================================

  const services: SessionServices = {
    sessionId,
    userId,
    personaId,
    sessionStartTime: Date.now(),
    realtimeConversationId,
    userProfile,
    historyTracker,
    contextManager,
    learningEngine,

    // Handoff State (per-session, fixes BUG #1-4)
    handoffState,

    // Advanced Intelligence Engines
    responseQualityTracker,
    patternAnalyzer,
    proactiveEngine,
    journeyTracker,
    crossSessionThreader,
    voicePaceAdapter,

    // Human-Level Interaction Engines
    humorCalibration,
    storyPreference,
    communicationMirroring,
    emotionalMemory,

    // Session Priming (cross-session continuity)
    sessionPriming,

    // Superhuman Memory Context - "Better than Human"
    superhumanContext,

    // ========================================================================
    // ANALYSIS METHODS
    // ========================================================================

    analyze: (message: string) => {
      const analysis = analyzeMessage(message, {
        userName: userProfile?.name,
        isReturningUser,
      });

      if (analysis.emotion?.primary) {
        lastUserEmotion = analysis.emotion.primary;
      }

      // If emotion detection confidence is low, enhance with LLM asynchronously
      // This won't block the response but will improve future understanding
      if (analysis.emotion.confidence < 0.5) {
        // Fire-and-forget LLM enhancement
        void (async () => {
          try {
            const { createEmotionLLMCaller } = await import('./llm-utils.js');
            const emotionDetector = getEmotionDetector();
            const llmCaller = createEmotionLLMCaller();
            const enhancedEmotion = await emotionDetector.detectWithLLM(message, llmCaller);

            // Update the last emotion if LLM got better result
            if (enhancedEmotion.confidence > analysis.emotion.confidence) {
              lastUserEmotion = enhancedEmotion.primary;
              getLogger().debug(
                {
                  keyword: analysis.emotion.primary,
                  llm: enhancedEmotion.primary,
                },
                'LLM-enhanced emotion detection'
              );
            }
          } catch {
            // Non-blocking, ignore errors
          }
        })();
      }

      learningEngine.processUserTurn(
        message,
        {
          emotion: analysis.emotion,
          intent: analysis.intent,
          state: analysis.state,
        },
        userProfile
      );

      // Feed pattern analyzer
      if (analysis.topics.detected.length > 0) {
        for (const topic of analysis.topics.detected) {
          patternAnalyzer.recordTopic(topic, analysis.emotion.intensity || 0.5);
        }
      }

      // Feed voice pace adapter
      const sessionDurationMinutes = Math.floor((Date.now() - services.sessionStartTime) / 60000);
      voicePaceAdapter.recordObservation({
        userMessage: message,
        responseTimeSeconds: sessionDurationMinutes > 0 ? 2 : 5,
        topic: analysis.topics.detected[0] || 'general',
        emotionalState: analysis.emotion.primary,
      });

      // 🧠 SUPERHUMAN: Refresh context when stress/emotion changes significantly
      // This ensures comfort patterns are applied dynamically
      if (analysis.emotion.distressLevel > 0.3 || analysis.emotion.intensity > 0.6) {
        services.refreshSuperhumanContext({
          detectedEmotion: analysis.emotion.primary,
          detectedStressLevel: analysis.emotion.distressLevel,
          currentTopic: analysis.topics.detected[0],
        });
      }

      return analysis;
    },

    addTurn: (role: 'user' | 'assistant', content: string, durationMs?: number) => {
      const turn: ConversationTurn = {
        role,
        content,
        timestamp: new Date(),
      };

      if (role === 'user') {
        historyTracker.addUserTurn(content, { durationMs });
        if (durationMs) {
          getSessionWPMTracker(sessionId).addSample(content, durationMs);

          // 🧠 SUPERHUMAN: Record voice pattern for "Better than Human" intelligence
          // This enables detection of energy level changes over time
          if (validatedUserId) {
            const wpmTracker = getSessionWPMTracker(sessionId);
            const avgWPM = wpmTracker.getAverageWPM();
            // 🦀 Rust-accelerated word counting
            const contentWordCount = RUST_COUNTING_AVAILABLE
              ? countWordsRust(content)
              : content.split(/\s+/).length;
            const currentWPM = contentWordCount / (durationMs / 60000) || avgWPM;

            // Determine pace relative to user's baseline
            const paceRatio = avgWPM > 0 ? currentWPM / avgWPM : 1;
            const pace =
              paceRatio < 0.85
                ? 'slower_than_usual'
                : paceRatio > 1.15
                  ? 'faster_than_usual'
                  : 'normal';

            // Simple energy heuristic based on pace and message length
            const energy =
              pace === 'slower_than_usual' && content.length < 50
                ? 'lower_than_usual'
                : pace === 'faster_than_usual' && content.length > 100
                  ? 'higher_than_usual'
                  : 'normal';

            recordVoicePattern(validatedUserId, sessionId, {
              patterns: {
                pace,
                energy,
                pauseFrequency: 'normal', // Would need pause detection for this
              },
            });
          }
        }
      } else {
        historyTracker.addAssistantTurn(content);
        learningEngine.processAssistantTurn(content);
      }

      contextManager.addTurn(turn);

      // Log turn count for debugging memory issues
      const turnCount = historyTracker.getTurnCount();
      if (turnCount <= 5 || turnCount % 10 === 0) {
        getLogger().debug(
          { sessionId, role, turnCount, contentPreview: content.slice(0, 50) },
          `📝 Turn added (total: ${turnCount})`
        );
      }

      // 🔴 REALTIME PERSISTENCE - persist turn immediately to Firestore
      // This happens in the background (fire-and-forget) to avoid blocking
      if (validatedUserId && realtimeConversationId) {
        const now = turn.timestamp || new Date();
        // 🧹 ISSUE-005 FIX: Strip SSML from assistant turns before persisting
        // Raw SSML tags like <break time="200ms"/> should not appear in memory
        const cleanContent = role === 'assistant' ? stripSSML(content) : content;
        realtimeMemory
          .persistTurn(validatedUserId, realtimeConversationId, {
            role,
            content: cleanContent,
            timestamp: now,
            metadata: durationMs ? { durationMs } : undefined,
          })
          .catch((err) => {
            // Non-blocking - log but don't throw
            getLogger().warn(
              { error: String(err), sessionId },
              'Failed to persist turn in realtime (data in RAM, will save at session end)'
            );
          });
      }
    },

    // ========================================================================
    // CONTEXT METHODS
    // ========================================================================

    getPromptContext: () => {
      const state = stateMachine.getState();
      const guidance = stateMachine.getGuidance();
      const emotion = getEmotionDetector().detect('');

      return contextManager.buildPromptContext(state, guidance, emotion);
    },

    getDynamicContext: () => {
      return learningEngine.buildDynamicContext(userProfile);
    },

    getEnhancedPromptContext: () => {
      const sections: string[] = [];

      const baseContext = contextManager.buildPromptContext(
        stateMachine.getState(),
        stateMachine.getGuidance(),
        getEmotionDetector().detect('')
      );
      if (baseContext.formattedForPrompt) {
        sections.push(baseContext.formattedForPrompt);
      }

      const dynamicContext = learningEngine.buildDynamicContext(userProfile);
      if (dynamicContext.formattedForPrompt) {
        sections.push(dynamicContext.formattedForPrompt);
      }

      if (userProfile) {
        const personalizedGuidance = personalizer.enhancePromptWithPersonalization('', userProfile);
        if (personalizedGuidance.trim()) {
          sections.push(personalizedGuidance);
        }
      }

      // 🧠 SUPERHUMAN MEMORY - "Better than Human" proactive intelligence
      // Surfaces important dates, comfort patterns, growth celebrations
      if (services.superhumanContext?.promptInjection) {
        sections.push(services.superhumanContext.promptInjection);
      }

      return sections.join('\n\n');
    },

    // ========================================================================
    // SPEECH METHODS
    // ========================================================================

    getSpeechContext: (text?: string, userEmotion?: string) => {
      const state = stateMachine.getState();
      const emotion = text ? getEmotionDetector().detect(text) : undefined;
      const topics = text ? getTopicTracker().extract(text).detected : undefined;

      const currentWPM = getSessionWPMTracker(sessionId).getAverageWPM();

      let effectiveWPM = currentWPM;
      if (userProfile?.averageWPM) {
        effectiveWPM = Math.round(currentWPM * 0.7 + userProfile.averageWPM * 0.3);
      } else if (userProfile?.speakingPace) {
        const paceToWPM = { slow: 110, moderate: 150, fast: 180 };
        effectiveWPM = Math.round(currentWPM * 0.7 + paceToWPM[userProfile.speakingPace] * 0.3);
      }

      const detectedUserEmotion = userEmotion || lastUserEmotion;

      return buildSpeechContext({
        userWPM: effectiveWPM,
        userText: text,
        emotion,
        userEmotion: detectedUserEmotion,
        phase: state.phase,
        topics,
        turnCount: historyTracker.getTurnCount(),
        personaSpeech,
        personaEnergy,
      });
    },

    tagWithSsml: (text: string) => {
      const speechContext = services.getSpeechContext(text);
      const state = stateMachine.getState();
      const textLower = text.toLowerCase();

      const storyPatterns =
        /\b(i remember|back in|when i was|years ago|one time|there was|let me tell you|i'll never forget|i once|my father|at vanguard|in 1974|in 1975|in 2008)\b/i;
      const isStory = storyPatterns.test(textLower);

      if (isStory) {
        return tagStory(text, speechContext, personaId);
      }

      switch (state.phase) {
        case 'supporting':
          return tagSupportResponse(text, speechContext, personaId);
        case 'advising':
          return tagAdvice(text, speechContext, personaId);
        case 'wrapping_up':
          return tagWrapUp(text, speechContext, personaId);
        default:
          return tagTextWithSsmlAdaptive(text, speechContext, personaId);
      }
    },

    // ========================================================================
    // MEMORY METHODS
    // ========================================================================

    searchKnowledge: async (query: string) => {
      return semanticRagLookup(query);
    },

    searchPastConversations: async (query: string) => {
      if (!userId) return null;

      try {
        const results = await semanticSearch(query, {
          topK: 3,
          sources: ['conversation'],
          userId,
          minScore: 0.4,
        });

        if (results.length === 0) return null;

        const snippets = results.map((r) => r.content.slice(0, 200)).join(' | ');
        return `From previous conversations: ${snippets}`;
      } catch (error) {
        getLogger().debug({ error, userId }, 'Failed to search past conversations');
        return null;
      }
    },

    // ========================================================================
    // QUALITY TRACKING METHODS
    // ========================================================================

    trackResponseQuality: (response: string, userReaction: 'positive' | 'neutral' | 'negative') => {
      const responseAnalysis = responseQualityTracker.analyzeResponse(response);
      const engagementMap = { positive: 0.85, neutral: 0.5, negative: 0.2 };

      const responseStyle = {
        length: response.length,
        type: responseAnalysis.type,
        hasStory: responseAnalysis.hadStory,
        hasAdvice: responseAnalysis.hadAdvice,
        hasQuestion: responseAnalysis.hadQuestion,
        hasHumor: responseAnalysis.hadHumor,
        engagementScore: engagementMap[userReaction],
      };

      if (userReaction === 'positive') {
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'response_style_positive',
          value: responseStyle,
          confidence: 0.7,
          source: 'inferred',
        });
      } else if (userReaction === 'negative') {
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'response_style_negative',
          value: responseStyle,
          confidence: 0.7,
          source: 'inferred',
        });
      }

      getLogger().debug(
        {
          responseType: responseAnalysis.type,
          reaction: userReaction,
          length: responseAnalysis.length,
        },
        'Response quality tracked'
      );
    },

    /* eslint-disable @typescript-eslint/no-misused-promises */
    recordResponseSignal: async (params: {
      agentResponse: string;
      userResponse: string;
      topic: string;
      conversationPhase: string;
      emotion?: { primary: string; intensity: number };
      storyId?: string;
      questionAsked?: string;
    }): Promise<void> => {
      /* eslint-enable @typescript-eslint/no-misused-promises */
      const {
        agentResponse,
        userResponse,
        topic,
        conversationPhase,
        emotion,
        storyId,
        questionAsked,
      } = params;

      // Record the full quality signal
      const signal = responseQualityTracker.recordSignal(
        agentResponse,
        userResponse,
        topic,
        conversationPhase,
        emotion
      );

      // Feed high/low engagement signals into learning engine
      if (signal.engagementScore >= 0.8) {
        const responseAnalysis = responseQualityTracker.analyzeResponse(agentResponse);
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'high_engagement_response',
          value: {
            type: responseAnalysis.type,
            length: responseAnalysis.length,
            hadStory: responseAnalysis.hadStory,
            hadHumor: responseAnalysis.hadHumor,
            topic,
            engagementScore: signal.engagementScore,
            storyId, // Track which story was effective
            questionAsked, // Track which question led to engagement
          },
          confidence: 0.8,
          source: 'inferred',
        });

        // If a specific story was told and got high engagement, record it
        if (storyId && personaId) {
          try {
            const { getCommunityInsights } =
              await import('../intelligence/collective/community-insights.js');
            const communityInsights = getCommunityInsights();
            if (communityInsights) {
              communityInsights.recordStoryUsage(
                storyId,
                personaId,
                {
                  topic,
                  relationshipStage: conversationPhase,
                  userEmotion: emotion?.primary || 'neutral',
                },
                'connected', // High engagement = connected reaction
                signal.engagementScore
              );
              // 📊 OBSERVABILITY: Track effective stories
              getLogger().info(
                {
                  storyId,
                  personaId,
                  topic,
                  engagement: signal.engagementScore.toFixed(2),
                  outcome: 'positive',
                },
                '📖 Story resonated with user (high engagement)'
              );
            }
          } catch {
            // Community insights not available
          }
        }

        // If a question led to high engagement, record it as a breakthrough question
        if (questionAsked && personaId) {
          try {
            const { getCommunityInsights } =
              await import('../intelligence/collective/community-insights.js');
            const communityInsights = getCommunityInsights();
            if (communityInsights) {
              communityInsights.recordBreakthroughQuestion(
                questionAsked,
                personaId,
                topic,
                conversationPhase, // context string
                signal.engagementScore // engagementLift
              );
              // 📊 OBSERVABILITY: Track breakthrough questions
              getLogger().info(
                {
                  questionPattern: questionAsked.slice(0, 80),
                  personaId,
                  topic,
                  engagement: signal.engagementScore.toFixed(2),
                },
                '💡 Breakthrough question detected (high engagement)'
              );
            }
          } catch {
            // Community insights not available
          }
        }
      } else if (signal.engagementScore <= 0.3) {
        const responseAnalysis = responseQualityTracker.analyzeResponse(agentResponse);
        learningEngine.captureExternalInsight({
          type: 'preference',
          key: 'low_engagement_response',
          value: {
            type: responseAnalysis.type,
            length: responseAnalysis.length,
            hadStory: responseAnalysis.hadStory,
            hadHumor: responseAnalysis.hadHumor,
            topic,
            engagementScore: signal.engagementScore,
            storyId, // Track which story didn't resonate
            questionAsked, // Track which question didn't work
          },
          confidence: 0.7,
          source: 'inferred',
        });

        // If a story didn't resonate, record negative outcome
        if (storyId && personaId) {
          try {
            const { getCommunityInsights } =
              await import('../intelligence/collective/community-insights.js');
            const communityInsights = getCommunityInsights();
            if (communityInsights) {
              communityInsights.recordStoryUsage(
                storyId,
                personaId,
                {
                  topic,
                  relationshipStage: conversationPhase,
                  userEmotion: emotion?.primary || 'neutral',
                },
                'indifferent', // Low engagement = indifferent reaction
                signal.engagementScore
              );
              // 📊 OBSERVABILITY: Track stories that didn't land
              getLogger().debug(
                {
                  storyId,
                  personaId,
                  topic,
                  engagement: signal.engagementScore.toFixed(2),
                  outcome: 'negative',
                },
                '📖 Story did not resonate (low engagement)'
              );
            }
          } catch {
            // Community insights not available
          }
        }
      }

      // Feed into community insights if available
      try {
        const { getCommunityInsights } =
          await import('../intelligence/collective/community-insights.js');
        const communityInsights = getCommunityInsights();
        if (communityInsights && personaId) {
          communityInsights.recordEngagementSignal({
            personaId,
            responseType: signal.responseType,
            topic,
            engagementScore: signal.engagementScore,
            timestamp: new Date(),
          });
        }
      } catch {
        // Community insights not available
      }

      getLogger().debug(
        {
          engagementScore: signal.engagementScore,
          responseType: signal.responseType,
          userReaction: signal.userReaction,
        },
        'Full response signal recorded'
      );
    },

    captureInsight: (type: string, key: string, value: unknown, confidence: number) => {
      learningEngine.captureExternalInsight({
        type: type as
          | 'preference'
          | 'concern'
          | 'goal'
          | 'relationship'
          | 'communication_style'
          | 'topic_interest'
          | 'emotional_pattern',
        key,
        value,
        confidence,
        source: 'inferred',
      });
    },

    getProactiveInsights: async () => {
      if (!userProfile) {
        return { insights: [], highPriorityCount: 0 };
      }

      // Get insights from existing proactive engine
      const insights = proactiveEngine.getUndeliveredInsights();
      let highPriorityCount = insights.filter((i) => i.priority === 'high').length;
      const nextInsight = proactiveEngine.getNextInsight();
      let suggestedConversationStarter = nextInsight?.message;
      let suggestedInsightId = nextInsight?.id;

      // V3.2: Also check the new Semantic Intelligence Insight Broker
      if (userId) {
        try {
          const { getInsightsToSurface, markInsightSurfaced } =
            await import('./superhuman/semantic-intelligence/insight-broker.js');

          const semanticInsights = await getInsightsToSurface(userId, {
            isSessionStart: true,
            hourOfDay: new Date().getHours(),
          });

          // Count high priority semantic insights
          const semanticHighPriority = semanticInsights.filter(
            (i) => i.priority === 'high' || i.priority === 'critical'
          );
          highPriorityCount += semanticHighPriority.length;

          // If no suggestion from proactive engine, use top semantic insight
          if (!suggestedConversationStarter && semanticInsights.length > 0) {
            const topInsight = semanticInsights[0];
            suggestedConversationStarter = topInsight.insight;
            suggestedInsightId = topInsight.id;

            // Mark as surfaced (non-blocking)
            void markInsightSurfaced(userId, topInsight.id);
          }
        } catch (e) {
          // Semantic insights are optional enhancement
          log.debug({ error: String(e) }, 'Semantic insights not available');
        }
      }

      return {
        insights,
        highPriorityCount,
        suggestedConversationStarter,
        // Include insight ID for delivery tracking
        suggestedInsightId,
      };
    },

    /**
     * Mark a proactive insight as delivered
     */
    markInsightDelivered: (insightId: string) => {
      proactiveEngine.markDelivered(insightId);
    },

    getOpenThreads: () => {
      return crossSessionThreader.getOpenThreads();
    },

    /**
     * Get a natural conversation starter from open threads
     * Use this to resume conversations across sessions
     */
    getThreadConversationStarter: () => {
      return crossSessionThreader.getConversationStarter();
    },

    /**
     * Get thread context formatted for prompt injection
     */
    getThreadContextForPrompt: () => {
      return crossSessionThreader.getThreadContext();
    },

    // ========================================================================
    // SUPERHUMAN MEMORY METHODS - "Better than Human" proactive intelligence
    // ========================================================================

    /**
     * Get superhuman memory context with proactive insights
     */
    getSuperhumanContext: () => {
      return services.superhumanContext;
    },

    /**
     * Refresh superhuman context with current conversation state
     * Call this when emotion/stress level changes mid-conversation
     */
    refreshSuperhumanContext: (options?: {
      detectedEmotion?: string;
      detectedStressLevel?: number;
      currentTopic?: string;
    }) => {
      if (!services.userProfile) return;

      try {
        const history = historyTracker.getSessionHistory();
        const recentTopics = history.metadata.topicsDiscussed || [];

        services.superhumanContext = buildSuperhumanContext(services.userProfile, {
          detectedEmotion: options?.detectedEmotion,
          detectedStressLevel: options?.detectedStressLevel,
          currentTopic: options?.currentTopic,
          recentTopics,
          sessionCount: services.userProfile.totalConversations || 0,
          conversationContext: recentTopics.slice(-3).join(', '),
        });

        getLogger().debug(
          { insights: services.superhumanContext?.insights.length || 0 },
          '🧠 Refreshed superhuman context'
        );
      } catch (error) {
        getLogger().debug({ error: String(error) }, 'Failed to refresh superhuman context');
      }
    },

    /**
     * Mark a superhuman insight as delivered
     */
    markSuperhumanInsightDelivered: (insightId: string) => {
      markSuperhumanInsightDeliveredFn(insightId);
      getLogger().debug({ insightId }, '✓ Superhuman insight marked as delivered');
    },

    /**
     * Get superhuman memory prompt injection (formatted for LLM)
     */
    getSuperhumanPromptInjection: () => {
      return services.superhumanContext?.promptInjection || '';
    },

    /**
     * Update humanizing state
     * FIX BUG #session-8: Limit array growth to prevent memory issues
     */
    updateHumanizingState: (update: HumanizingStateUpdate) => {
      if (humanizingStateUpdates.length >= MAX_HUMANIZING_UPDATES) {
        // Remove oldest updates when limit reached
        humanizingStateUpdates.shift();
        getLogger().debug({ sessionId }, 'Evicted oldest humanizing state update (limit reached)');
      }

      humanizingStateUpdates.push(update);
      getLogger().debug(
        { sessionId, updateCount: humanizingStateUpdates.length },
        '🎭 Humanizing state update recorded'
      );
    },

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * Save user profile with error handling
     * FIX BUG #session-7: Don't fail silently on save errors
     * FIX BUG #memory-audit-2: Use services.userProfile NOT the closure variable!
     * The closure variable userProfile was stale - any updates made to services.userProfile
     * (like totalConversations increment, lastConversationSummary, etc.) were being ignored.
     */
    saveProfile: async () => {
      // CRITICAL FIX: Use services.userProfile, not the closure variable!
      // The closure variable is stale and doesn't include updates from endSession()
      const profileToSave = services.userProfile;
      if (profileToSave && validatedUserId) {
        try {
          const history = historyTracker.getSessionHistory();
          const state = stateMachine.getState();

          const { updateProfileFromSession } = await import('../types/user-profile.js');
          const updated = updateProfileFromSession(profileToSave, {
            name: profileToSave.name,
            mood: state.currentMood,
            energyLevel:
              state.distressLevel < 0.3 ? 'high' : state.distressLevel < 0.6 ? 'medium' : 'low',
            topicsDiscussed: history.metadata.topicsDiscussed,
            emotionalMoments: history.metadata.emotionalJourney.map((e) => ({
              timestamp: new Date(),
              emotion: e,
              intensity: 0.5,
            })),
            sessionDurationMinutes: Math.floor(historyTracker.getDurationSeconds() / 60),
          });

          const sessionWPM = getSessionWPMTracker(sessionId).getAverageWPM();
          if (sessionWPM > 0) {
            if (updated.averageWPM) {
              updated.averageWPM = Math.round(updated.averageWPM * 0.7 + sessionWPM * 0.3);
            } else {
              updated.averageWPM = sessionWPM;
            }
            updated.speakingPace =
              sessionWPM < 120 ? 'slow' : sessionWPM > 180 ? 'fast' : 'moderate';
          }

          // SAFEGUARD: Ensure we ALWAYS have a lastConversationSummary
          // This is the ONLY reliable marker that Ferni remembers the conversation
          if (!updated.lastConversationSummary) {
            const turnCount = history.turns.length;
            const durationMin = Math.floor(historyTracker.getDurationSeconds() / 60);
            const topics = history.metadata.topicsDiscussed.slice(0, 3);

            if (topics.length > 0) {
              updated.lastConversationSummary = `Chatted about ${topics.join(', ')}`;
            } else if (turnCount > 0) {
              updated.lastConversationSummary = `Had a ${durationMin || 1}-minute conversation`;
            } else {
              updated.lastConversationSummary = `Connected on ${new Date().toLocaleDateString()}`;
            }

            getLogger().info(
              { userId: validatedUserId, summary: updated.lastConversationSummary },
              '🔒 SAFEGUARD: Set minimum lastConversationSummary in saveProfile()'
            );
          }

          await global.store.saveProfile(updated);
          services.userProfile = updated;

          getLogger().info(
            { userId: validatedUserId, lastSummary: updated.lastConversationSummary?.slice(0, 50) },
            '✅ Saved profile for user'
          );
        } catch (error) {
          // FIX BUG #session-7: Log errors instead of silent failure
          getLogger().error(
            { userId: validatedUserId, error: String(error) },
            'Failed to save user profile'
          );
          throw error; // Re-throw to allow caller to handle
        }
      }
    },

    endSession: async () => {
      getLogger().info(`Ending session: ${sessionId}`);
      const sessionEndStartTime = Date.now();

      // FIX: Stop auto-save FIRST to prevent race conditions during session end
      // Auto-save running during final saves can cause data corruption or double-writes
      if (validatedUserId) {
        stopAutoSave(validatedUserId);
        getLogger().debug({ userId: validatedUserId }, 'Stopped auto-save at session start');
      }

      if (validatedUserId && userProfile) {
        try {
          const turns = historyTracker.getSimpleTurns();

          // CRITICAL LOGGING: Understand why summaries aren't being saved
          getLogger().info(
            {
              sessionId,
              userId: validatedUserId,
              turnCount: turns.length,
              userTurnCount: turns.filter((t) => t.role === 'user').length,
              assistantTurnCount: turns.filter((t) => t.role === 'assistant').length,
              historyTrackerTurnCount: historyTracker.getTurnCount(),
              sessionDurationSec: historyTracker.getDurationSeconds(),
            },
            '📊 Session end: turn analysis'
          );

          // FIX BUG #session-20: Handle empty turns gracefully
          // Still finalize learning even if no turns (may have session-level insights)
          if (turns.length === 0) {
            getLogger().warn(
              { sessionId, userId: validatedUserId },
              '⚠️ No conversation turns to summarize - this means addTurn() was never called'
            );
          }

          let summary = null;
          if (turns.length > 0) {
            getLogger().info(
              { sessionId, turnCount: turns.length, userId: validatedUserId },
              '📝 Starting conversation summarization'
            );

            // FIX BUG #session-6: Generate conversation summary with timeout
            // Try LLM summarization first for richer understanding, fall back to extraction
            try {
              const { createSummarizationLLMCaller } = await import('./llm-utils.js');
              const { summarizeWithLLM } = await import('../memory/index.js');
              const llmCaller = createSummarizationLLMCaller();

              summary = await withTimeout(
                summarizeWithLLM(sessionId, turns, llmCaller),
                SUMMARIZE_TIMEOUT_MS,
                'summarizeWithLLM',
                sessionId
              );

              if (summary) {
                getLogger().info(
                  { sessionId, keyPoints: summary.keyPoints?.length || 0 },
                  '✅ LLM summarization succeeded'
                );
              }
            } catch (llmError) {
              // LLM failed, fall through to extraction
              getLogger().warn(
                { sessionId, error: String(llmError) },
                '⚠️ LLM summarization failed, trying extraction fallback'
              );
            }

            // Fall back to extraction-based summarization
            if (!summary) {
              try {
                summary = await withTimeout(
                  summarizeConversation(sessionId, turns),
                  SUMMARIZE_TIMEOUT_MS,
                  'summarizeConversation',
                  sessionId
                );
                if (summary) {
                  getLogger().info(
                    { sessionId, keyPoints: summary.keyPoints?.length || 0 },
                    '✅ Extraction summarization succeeded'
                  );
                }
              } catch (extractError) {
                getLogger().warn(
                  { sessionId, error: String(extractError) },
                  '⚠️ Extraction summarization also failed'
                );
              }
            }

            if (!summary) {
              getLogger().warn(
                { sessionId, turnCount: turns.length },
                '❌ All summarization methods failed - will use fallback'
              );
            } else {
              await global.store.saveSummary(validatedUserId, summary);

              // Index for semantic retrieval
              try {
                const summaryText = [
                  ...summary.mainTopics,
                  ...summary.keyPoints,
                  summary.emotionalArc,
                ].join(' ');

                await indexConversationSummary(validatedUserId, {
                  id: summary.id,
                  text: summaryText,
                  topics: summary.mainTopics,
                  timestamp: summary.timestamp,
                  embedding: summary.embedding,
                });

                getLogger().info('Indexed conversation for future retrieval');
              } catch (indexError) {
                getLogger().warn(`Failed to index conversation (non-blocking): ${indexError}`);
              }
            }
          } // Close turns.length > 0 block

          // FIX BUG #session-20: Finalize learning regardless of turns count
          // Learning engine may have captured session-level insights
          const learningData = learningEngine.finalizeSession(userProfile);
          const stats = learningEngine.getSessionStats();

          getLogger().info(
            {
              keyMoments: stats.keyMoments,
              insights: stats.insights,
              detailsCaptured: stats.detailsCaptured,
              topicsDiscussed: stats.topicsDiscussed,
            },
            'Session learning stats'
          );

          // Apply learning to profile
          let updatedProfile = UserLearningEngine.applyLearningToProfile(userProfile, learningData);

          // Apply humanizing state updates
          if (humanizingStateUpdates.length > 0) {
            try {
              const {
                getHumanizingState,
                mergeHumanizingStateUpdate,
                applyHumanizingStateToProfile,
                logHumanizingStateSummary,
              } = await import('./humanizing-state.js');

              let humanizingState = getHumanizingState(updatedProfile);

              for (const update of humanizingStateUpdates) {
                humanizingState = mergeHumanizingStateUpdate(humanizingState, update);
              }

              updatedProfile = applyHumanizingStateToProfile(updatedProfile, humanizingState);
              logHumanizingStateSummary(humanizingState, validatedUserId || 'unknown');
            } catch (humanizingError) {
              getLogger().warn(
                { error: String(humanizingError) },
                'Failed to persist humanizing state (non-fatal)'
              );
            }
          }

          if (summary?.keyPoints && summary.keyPoints.length > 0) {
            updatedProfile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');
          } else if (turns.length > 0) {
            // FIX: Always save at least a basic summary from turns
            // This ensures returning users are recognized even if LLM summarization fails
            const userTurns = turns.filter((t) => t.role === 'user');
            if (userTurns.length > 0) {
              const topics = userTurns
                .slice(-3)
                .map((t) => t.content.slice(0, 50).replace(/[.!?]+$/, ''));
              updatedProfile.lastConversationSummary = `Discussed: ${topics.join('; ')}`;
              getLogger().info(
                {
                  userId: validatedUserId,
                  fallbackSummary: updatedProfile.lastConversationSummary.slice(0, 60),
                },
                '📝 Used fallback summary (LLM summarization unavailable)'
              );
            }
          }

          // Persist handoff state to profile for cross-session continuity
          try {
            const { getMeetingCounts, getLastTopicsPerPersona } =
              await import('../tools/handoff-state.js');
            const meetingCounts = getMeetingCounts(handoffState);
            const lastTopicsPerPersona = getLastTopicsPerPersona(handoffState);

            if (!updatedProfile.customData) {
              updatedProfile.customData = {};
            }
            (updatedProfile.customData as Record<string, unknown>).meetingCounts = meetingCounts;
            (updatedProfile.customData as Record<string, unknown>).lastTopicsPerPersona =
              lastTopicsPerPersona;

            getLogger().debug(
              { meetingCounts: Object.keys(meetingCounts).length },
              'Persisted handoff state to profile'
            );
          } catch (handoffPersistError) {
            getLogger().warn(
              { error: String(handoffPersistError) },
              'Failed to persist handoff state (non-fatal)'
            );
          }

          // Persist cross-session threads for conversation continuity
          // This enables "Where were we?" moments across sessions
          try {
            const threadData = crossSessionThreader.getAllData();
            const openThreadCount = threadData.threads.filter((t) => t.status === 'open').length;
            const pendingFollowUps = threadData.followUps.filter((f) => !f.delivered).length;

            if (openThreadCount > 0 || pendingFollowUps > 0) {
              (updatedProfile.customData as Record<string, unknown>).openThreads =
                threadData.threads;
              (updatedProfile.customData as Record<string, unknown>).promisedFollowUps =
                threadData.followUps;

              getLogger().info(
                { openThreads: openThreadCount, pendingFollowUps },
                'Persisted cross-session threads to profile'
              );
            }
          } catch (threadPersistError) {
            getLogger().warn(
              { error: String(threadPersistError) },
              'Failed to persist cross-session threads (non-fatal)'
            );
          }

          // Persist emotional memory for cross-session emotional continuity
          // This enables "Last time you seemed stressed about X" moments
          try {
            const moments = emotionalMemory.exportMoments();
            if (moments.length > 0) {
              // Keep only recent moments (last 50) to avoid profile bloat
              const recentMoments = moments.slice(-50);
              (updatedProfile.customData as Record<string, unknown>).emotionalMoments =
                recentMoments;

              getLogger().info(
                { momentCount: recentMoments.length },
                'Persisted emotional memory to profile'
              );
            }
          } catch (emotionalMemoryError) {
            getLogger().warn(
              { error: String(emotionalMemoryError) },
              'Failed to persist emotional memory (non-fatal)'
            );
          }

          // FIX: Persist ALL intelligence state to profile using unified persistence
          // This captures humor calibration, story preferences, communication style,
          // voice pace, response quality, and conversation patterns
          try {
            updatedProfile = applyIntelligenceToProfile(updatedProfile, validatedUserId);
            getLogger().info(
              { userId: validatedUserId },
              '🧠 Applied intelligence state to profile'
            );
          } catch (intelligenceError) {
            getLogger().warn(
              { error: String(intelligenceError), userId: validatedUserId },
              'Failed to apply intelligence state (non-fatal)'
            );
          }

          // ================================================================
          // 🌟 PERSONAL JOURNEY: Persist journey awareness data
          // Milestones, streaks, seasonal memories, life chapters
          // ================================================================
          try {
            const { getPersonalJourneyForPersistence, updateJourneyFromConversation } =
              await import('./personal-journey/session-integration.js');

            // Update chapter detection and seasonal memory from conversation
            if (summary) {
              await updateJourneyFromConversation(validatedUserId, {
                topics: summary.mainTopics || [],
                emotions: summary.emotionalArc ? [summary.emotionalArc] : [],
                keyMoments: summary.keyPoints?.slice(0, 3),
                wins: summary.keyPoints?.filter((kp) =>
                  /achieved|completed|succeeded|won|accomplished/i.test(kp)
                ),
                struggles: summary.keyPoints?.filter((kp) =>
                  /struggled|difficult|hard|worried|anxious|stressed/i.test(kp)
                ),
              });
            }

            // Get journey data for persistence
            const journeyData = getPersonalJourneyForPersistence(validatedUserId);
            if (
              journeyData &&
              (journeyData.rhythm || journeyData.seasonal || journeyData.chapters)
            ) {
              updatedProfile.personalJourney = journeyData;
              getLogger().info(
                {
                  userId: validatedUserId,
                  hasRhythm: !!journeyData.rhythm,
                  hasSeasonal: !!journeyData.seasonal,
                  hasChapters: !!journeyData.chapters,
                  deliveryRecords: journeyData.deliveryHistory?.length || 0,
                },
                '🌟 Personal journey data persisted to profile'
              );
            }

            // Capture seasonal snapshot if needed (end of season)
            const { captureSeasonalSnapshotIfNeeded } =
              await import('./personal-journey/session-integration.js');
            if (summary) {
              const captured = await captureSeasonalSnapshotIfNeeded(validatedUserId, {
                emotionalState: summary.emotionalArc || 'neutral',
                activeThemes: summary.mainTopics || [],
                keyMoments: summary.keyPoints || [],
              });
              if (captured) {
                getLogger().info({ userId: validatedUserId }, '🌸 Seasonal snapshot captured');
              }
            }
          } catch (journeyError) {
            getLogger().warn(
              { error: String(journeyError), userId: validatedUserId },
              'Failed to persist personal journey data (non-fatal)'
            );
          }

          // ================================================================
          // 🧠 HUMAN MEMORY: Extract relationship signals from conversation
          // Dates, values, dreams, fears, growth markers, comfort patterns...
          // ================================================================
          try {
            const { extractHumanSignals, mergeSignalsIntoMemory } =
              await import('../memory/human-signal-extractor.js');

            if (turns.length > 0) {
              const signals = extractHumanSignals(turns, {
                userId: validatedUserId,
                personaId: services.personaId || 'ferni',
                userName: userProfile.preferredName || userProfile.name,
                existingMemory: updatedProfile.humanMemory,
                sessionEmotion: summary?.emotionalArc,
              });

              // Only merge if we found meaningful signals
              const totalSignals = Object.values(signals).reduce((sum, arr) => sum + arr.length, 0);

              if (totalSignals > 0) {
                updatedProfile.humanMemory = mergeSignalsIntoMemory(
                  updatedProfile.humanMemory,
                  signals
                );
                getLogger().info(
                  {
                    userId: validatedUserId,
                    totalSignals,
                    dates: signals.importantDates.length,
                    values: signals.values.length,
                    dreams: signals.dreams.length,
                    fears: signals.fears.length,
                    growth: signals.growthMarkers.length,
                    comfort: signals.comfortPatterns.length,
                  },
                  '🌟 Human memory signals extracted and merged'
                );
              }
            }
          } catch (humanMemoryError) {
            getLogger().warn(
              { error: String(humanMemoryError), userId: validatedUserId },
              'Failed to extract human memory signals (non-fatal)'
            );
          }

          // ================================================================
          // NOTE: totalConversations, totalMinutesTalked, lastContact, updatedAt
          // are all handled by updateProfileFromSession() inside saveProfile().
          // We MUST NOT increment here or we'll double-count!
          // ================================================================

          services.userProfile = updatedProfile;
          await services.saveProfile();

          getLogger().info(
            {
              userId: validatedUserId,
              totalConversations: updatedProfile.totalConversations,
              hasLastSummary: !!updatedProfile.lastConversationSummary,
              lastSummaryPreview: updatedProfile.lastConversationSummary?.slice(0, 60),
            },
            '✅ Profile saved with conversation data'
          );

          // 🧠 Index user memories for semantic search (fire-and-forget)
          // This enables "remember when..." queries across all user data
          // Including human-centric memory: dates, values, dreams, growth, etc.
          try {
            const { indexUserMemories } = await import('../memory/user-memory-indexer.js');
            void indexUserMemories(validatedUserId, updatedProfile, {
              // Index both profile data AND human-centric memory
              categories: [
                // Profile data (P1)
                'key_moment',
                'person',
                'thread',
                'followup',
                'life_event',
                'goal',
                // Human memory (P0/P1)
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
                  getLogger().info(
                    {
                      userId: validatedUserId,
                      indexed: result.indexed,
                      categories: result.categories,
                    },
                    '🧠 User memories indexed for semantic search'
                  );
                }
              })
              .catch((err) => {
                getLogger().debug(
                  { error: String(err) },
                  'User memory indexing failed (non-blocking)'
                );
              });
          } catch (indexErr) {
            getLogger().debug({ error: String(indexErr) }, 'User memory indexer not available');
          }

          // 📤 Analyze session for proactive outreach opportunities
          // This extracts commitments, detects emotional state, and creates outreach triggers
          try {
            const { analyzeSessionForOutreach } = await import('./outreach/session-integration.js');
            const outreachResult = await analyzeSessionForOutreach({
              userId: validatedUserId,
              sessionId,
              personaId: services.personaId || 'ferni',
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

            if (outreachResult.triggersCreated > 0) {
              getLogger().info(
                {
                  userId: validatedUserId,
                  commitments: outreachResult.commitmentsFound,
                  triggers: outreachResult.triggersCreated,
                },
                '📤 Analyzed session for outreach'
              );
            }
          } catch (outreachError) {
            getLogger().debug(
              { error: String(outreachError) },
              'Outreach analysis skipped (non-fatal)'
            );
          }

          getLogger().info(
            {
              userId: validatedUserId,
              newKeyMoments: learningData.keyMoments.length,
              newInsights: learningData.insights.length,
              followUps: learningData.followUps.length,
            },
            'Applied learning to user profile'
          );
        } catch (error) {
          getLogger().warn(`Failed to save conversation summary/learning: ${error}`);
        }
      }

      // NOTE: Auto-save already stopped at session start (line ~1515)

      // Cleanup core components
      removeHistoryTracker(sessionId);
      removeContextManager(sessionId);
      resetLearningEngine();
      clearCurrentSessionMomentsGetter();

      // FIX: Use unified intelligence cleanup instead of manual removal
      if (validatedUserId) {
        cleanupIntelligenceEngines(validatedUserId);
      }

      // FIX BUG #session-5: Always cleanup session-specific intelligence engines
      // Preserving engines for authenticated users was causing memory leaks
      // The per-user data is already persisted to the profile above
      const cleanupEngineKey = validatedUserId || sessionId;
      removeResponseQualityTracker(cleanupEngineKey);
      removeConversationPatternAnalyzer(cleanupEngineKey);
      removeProactiveInsightEngine(cleanupEngineKey);
      removeFinancialJourneyTracker(cleanupEngineKey);
      removeCrossSessionThreader(cleanupEngineKey);
      removeVoicePaceAdapter(cleanupEngineKey);

      // Cleanup human-level interaction engines
      removeHumorCalibration(cleanupEngineKey);
      removeStoryPreference(cleanupEngineKey);
      removeCommunicationMirroring(cleanupEngineKey);
      removeEmotionalMemory(cleanupEngineKey);

      // FIX BUG #session-12: Clean up task manager callback
      try {
        const { resetTaskManager } = await import('../tasks/task-manager.js');
        resetTaskManager();
      } catch {
        // Task manager may not be loaded
      }

      getLogger().info({ userId: validatedUserId }, 'Intelligence engines cleaned up');

      // 🌱 BETTER-THAN-HUMAN: Capture growth snapshot at session end
      if (validatedUserId) {
        try {
          const { getGrowthVisibilityEngine } = await import('./growth-visibility-engine.js');
          const growthEngine = getGrowthVisibilityEngine(validatedUserId);
          growthEngine.captureSnapshot();

          // Export growth data to profile if we have one
          if (services.userProfile) {
            const growthData = growthEngine.exportForProfile();
            services.userProfile.customData = {
              ...services.userProfile.customData,
              growthSnapshots: growthData.snapshots,
              growthInsights: growthData.insights,
            };
          }
          getLogger().debug({ userId: validatedUserId }, '🌱 Growth snapshot captured');
        } catch (error) {
          getLogger().debug({ error }, 'Growth snapshot capture failed (non-blocking)');
        }
      }

      activeSessions.delete(sessionId);

      // Clear life data cache
      if (userId) {
        try {
          const { getLifeDataStore } = await import('./stores/life-data-store.js');
          getLifeDataStore().clearUserCache(userId);
        } catch (error) {
          getLogger().debug({ error }, 'Failed to clear life data cache (non-blocking)');
        }
      }

      // 🔴 REALTIME: End conversation and trigger async summarization
      // The turns are already persisted - summarization happens in background
      if (validatedUserId && realtimeConversationId) {
        try {
          await realtimeMemory.endConversation(validatedUserId, realtimeConversationId);

          // Fire-and-forget async summarization (won't block session end)
          realtimeMemory
            .summarizeConversationAsync(validatedUserId, realtimeConversationId)
            .catch((err) => {
              getLogger().warn(
                { error: String(err), conversationId: realtimeConversationId },
                'Async summarization failed (turns are still persisted)'
              );
            });

          getLogger().info(
            { userId: validatedUserId, conversationId: realtimeConversationId },
            '🔴 REALTIME: Conversation ended, async summarization triggered'
          );
        } catch (error) {
          getLogger().warn(
            { error: String(error), userId: validatedUserId },
            'Failed to end realtime conversation (non-blocking)'
          );
        }
      }

      // Flush unified trust persistence for this user
      if (validatedUserId) {
        try {
          await onSessionEndUnified(validatedUserId);
        } catch {
          // Non-critical
        }
      }

      // Record session end in metrics
      const sessionEndDurationMs = Date.now() - sessionEndStartTime;
      persistenceMetrics.recordSessionEnd(sessionId, sessionEndDurationMs);

      getLogger().info(`Session ${sessionId} ended and cleaned up`);
    },
  };

  // Store in active sessions
  activeSessions.set(sessionId, services);

  return services;
}

// ============================================================================
// SESSION ACCESS (Re-exported from ./session-manager/access.ts)
// ============================================================================

export const getSessionServices = getSession;
export const getActiveSessionIds = getActiveIds;
export const getActiveSessionCount = getActiveCount;
export const clearAllSessions = clearAll;
