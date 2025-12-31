/**
 * End Session Handler
 *
 * Handles the session end lifecycle including:
 * - Conversation summarization
 * - Learning data finalization
 * - Profile persistence
 * - Intelligence state persistence
 * - Cleanup operations
 *
 * @module session-manager/end-session
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

// Session manager utilities
import { withTimeout, generateFallbackSummary } from './utils.js';
import { SUMMARIZE_TIMEOUT_MS } from './constants.js';

// Memory imports
import {
  indexConversationSummary,
  removeHistoryTracker,
  clearCurrentSessionMomentsGetter,
  summarizeConversation,
  type ConversationTurn,
} from '../../memory/index.js';

// Context imports
import { removeContextManager } from '../../context/index.js';

// Intelligence imports
import {
  resetLearningEngine,
  UserLearningEngine,
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

// Intelligence persistence
import {
  applyIntelligenceToProfile,
  cleanupIntelligenceEngines,
  stopAutoSave,
} from '../intelligence-persistence.js';

// Real-time memory
import * as realtimeMemory from '../memory/realtime-memory.js';

// Unified persistence
import { onSessionEndUnified } from '../trust-systems/unified-persistence.js';

// Persistence metrics
import { persistenceMetrics } from '../analytics/persistence-metrics.js';

// Superhuman outreach intelligence
import { processAccumulatedSignals } from '../conversation-thread/superhuman-outreach-intelligence.js';

// Session types
import type { GlobalServices, SessionServices } from '../types.js';
import type { HumanizingStateUpdate } from '../humanizing-state.js';

/**
 * Options for ending a session
 */
export interface EndSessionOptions {
  sessionId: string;
  userId: string | undefined;
  validatedUserId: string | undefined;
  personaId: string | undefined;
  realtimeConversationId: string | undefined;
  sessionStartTime: number;
  services: SessionServices;
  global: GlobalServices;
  humanizingStateUpdates: HumanizingStateUpdate[];
  activeSessions: Map<string, SessionServices>;
}

/**
 * Handle the session end lifecycle
 *
 * This is a large operation that handles:
 * 1. Conversation summarization (LLM or extraction)
 * 2. Learning data finalization
 * 3. Various state persistence (handoff, threads, emotional, intelligence, journey, human memory)
 * 4. Profile saving
 * 5. Memory indexing
 * 6. Outreach analysis
 * 7. Cleanup of all engines and trackers
 * 8. Realtime memory finalization
 */
export async function handleEndSession(options: EndSessionOptions): Promise<void> {
  const {
    sessionId,
    userId,
    validatedUserId,
    personaId,
    realtimeConversationId,
    sessionStartTime,
    services,
    global,
    humanizingStateUpdates,
    activeSessions,
  } = options;

  const log = getLogger();
  log.info(`Ending session: ${sessionId}`);
  const sessionEndStartTime = Date.now();

  // Main session end logic (only if we have a valid user)
  if (validatedUserId && services.userProfile) {
    await finalizeUserSession({
      sessionId,
      validatedUserId,
      personaId,
      sessionStartTime,
      services,
      global,
      humanizingStateUpdates,
    });
  }

  // Stop auto-save before cleanup
  if (validatedUserId) {
    stopAutoSave(validatedUserId);
    log.debug({ userId: validatedUserId }, 'Stopped auto-save');
  }

  // Cleanup core components
  await cleanupCoreComponents(sessionId);

  // Cleanup intelligence engines
  const cleanupEngineKey = validatedUserId || sessionId;
  await cleanupIntelligenceEnginesAll(validatedUserId, cleanupEngineKey);

  // Capture growth snapshot
  if (validatedUserId) {
    await captureGrowthSnapshot(validatedUserId, services);
  }

  // Remove from active sessions
  activeSessions.delete(sessionId);

  // Clear life data cache
  if (userId) {
    await clearLifeDataCache(userId);
  }

  // Finalize realtime memory
  if (validatedUserId && realtimeConversationId) {
    await finalizeRealtimeMemory(validatedUserId, realtimeConversationId);
  }

  // Flush unified trust persistence
  if (validatedUserId) {
    await flushTrustPersistence(validatedUserId);
  }

  // 🧠 SUPERHUMAN OUTREACH: Process accumulated signals at session end
  // This triggers intelligent proactive outreach based on signals collected during the conversation
  if (validatedUserId && services.userProfile) {
    await processAccumulatedOutreachSignals(validatedUserId, services.userProfile);
  }

  // Record metrics
  const sessionEndDurationMs = Date.now() - sessionEndStartTime;
  persistenceMetrics.recordSessionEnd(sessionId, sessionEndDurationMs);

  log.info(`Session ${sessionId} ended and cleaned up`);
}

/**
 * Options for finalizing a user session
 */
interface FinalizeUserSessionOptions {
  sessionId: string;
  validatedUserId: string;
  personaId: string | undefined;
  sessionStartTime: number;
  services: SessionServices;
  global: GlobalServices;
  humanizingStateUpdates: HumanizingStateUpdate[];
}

/**
 * Finalize session for an authenticated user
 */
async function finalizeUserSession(options: FinalizeUserSessionOptions): Promise<void> {
  const {
    sessionId,
    validatedUserId,
    personaId,
    sessionStartTime,
    services,
    global,
    humanizingStateUpdates,
  } = options;

  const log = getLogger();
  const userProfile = services.userProfile!;

  try {
    const turns = services.historyTracker.getSimpleTurns();

    // Log turn analysis
    log.info(
      {
        sessionId,
        userId: validatedUserId,
        turnCount: turns.length,
        userTurnCount: turns.filter((t) => t.role === 'user').length,
        assistantTurnCount: turns.filter((t) => t.role === 'assistant').length,
        historyTrackerTurnCount: services.historyTracker.getTurnCount(),
        sessionDurationSec: services.historyTracker.getDurationSeconds(),
      },
      '📊 Session end: turn analysis'
    );

    // Handle empty turns
    if (turns.length === 0) {
      log.warn(
        { sessionId, userId: validatedUserId },
        '⚠️ No conversation turns to summarize - this means addTurn() was never called'
      );
    }

    // Generate summary
    let summary = null;
    if (turns.length > 0) {
      summary = await generateSummary(sessionId, turns);

      if (summary) {
        await global.store.saveSummary(validatedUserId, summary);
        await indexSummaryForRetrieval(validatedUserId, summary);
      }
    }

    // Finalize learning
    let updatedProfile = finalizeLearning(userProfile, services.learningEngine);

    // Apply humanizing state updates
    updatedProfile = await applyHumanizingState(
      updatedProfile,
      humanizingStateUpdates,
      validatedUserId
    );

    // Set conversation summary
    updatedProfile = setSummaryOnProfile(updatedProfile, summary, turns);

    // Persist all state
    updatedProfile = await persistAllState(
      updatedProfile,
      validatedUserId,
      sessionId,
      services,
      personaId,
      summary,
      turns
    );

    // Save profile
    services.userProfile = updatedProfile;
    await services.saveProfile();

    log.info(
      {
        userId: validatedUserId,
        totalConversations: updatedProfile.totalConversations,
        hasLastSummary: !!updatedProfile.lastConversationSummary,
        lastSummaryPreview: updatedProfile.lastConversationSummary?.slice(0, 60),
      },
      '✅ Profile saved with conversation data'
    );

    // Index user memories (fire-and-forget)
    await indexUserMemories(validatedUserId, updatedProfile);

    // Analyze for outreach
    await analyzeForOutreach(validatedUserId, sessionId, personaId, services, turns, summary);

    // Log learning stats
    const learningData = services.learningEngine.finalizeSession(userProfile);
    log.info(
      {
        userId: validatedUserId,
        newKeyMoments: learningData.keyMoments.length,
        newInsights: learningData.insights.length,
        followUps: learningData.followUps.length,
      },
      'Applied learning to user profile'
    );

    // 🎤 VOICE SKETCH: Update voice fingerprint for cross-device recognition
    // "Your voice sounds familiar" - enables recognition across devices
    try {
      const { getBaseline } = await import('../trust-systems/voice-prosody-learning.js');
      const { updateUserVoiceSketch } = await import('../voice/voice-sketch-builder.js');

      const baseline = getBaseline(validatedUserId);
      if (baseline && baseline.sampleCount >= 3) {
        const sessionDurationMs = Date.now() - sessionStartTime;
        await updateUserVoiceSketch(
          validatedUserId,
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

    // 🧠 FINAL PERSISTENCE: Save social graph and clear rate limits
    // "Better than Human" - Never lose learned data
    try {
      const { persistSocialGraph, clearRateLimits } = await import('../realtime-persistence.js');
      await persistSocialGraph(validatedUserId);
      clearRateLimits(validatedUserId);
      log.debug({ userId: validatedUserId }, '📇 Final social graph persistence completed');
    } catch (persistError) {
      log.warn({ error: String(persistError) }, 'Failed to persist social graph on session end');
    }
  } catch (error) {
    log.warn(`Failed to save conversation summary/learning: ${error}`);
  }
}

/**
 * Generate conversation summary
 */
async function generateSummary(
  sessionId: string,
  turns: ConversationTurn[]
): Promise<Awaited<ReturnType<typeof summarizeConversation>> | null> {
  const log = getLogger();
  log.info({ sessionId, turnCount: turns.length }, '📝 Starting conversation summarization');

  // Try LLM summarization first
  try {
    const { createSummarizationLLMCaller } = await import('../llm-utils.js');
    const { summarizeWithLLM } = await import('../../memory/index.js');
    const llmCaller = createSummarizationLLMCaller();

    const summary = await withTimeout(
      summarizeWithLLM(sessionId, turns, llmCaller),
      SUMMARIZE_TIMEOUT_MS,
      'summarizeWithLLM',
      sessionId
    );

    if (summary) {
      log.info(
        { sessionId, keyPoints: summary.keyPoints?.length || 0 },
        '✅ LLM summarization succeeded'
      );
      return summary;
    }
  } catch (llmError) {
    log.warn(
      { sessionId, error: String(llmError) },
      '⚠️ LLM summarization failed, trying extraction fallback'
    );
  }

  // Fall back to extraction-based summarization
  try {
    const summary = await withTimeout(
      summarizeConversation(sessionId, turns),
      SUMMARIZE_TIMEOUT_MS,
      'summarizeConversation',
      sessionId
    );

    if (summary) {
      log.info(
        { sessionId, keyPoints: summary.keyPoints?.length || 0 },
        '✅ Extraction summarization succeeded'
      );
      return summary;
    }
  } catch (extractError) {
    log.warn({ sessionId, error: String(extractError) }, '⚠️ Extraction summarization also failed');
  }

  log.warn(
    { sessionId, turnCount: turns.length },
    '❌ All summarization methods failed - will use fallback'
  );
  return null;
}

/**
 * Index summary for semantic retrieval
 */
async function indexSummaryForRetrieval(
  userId: string,
  summary: NonNullable<Awaited<ReturnType<typeof summarizeConversation>>>
): Promise<void> {
  const log = getLogger();

  try {
    const summaryText = [...summary.mainTopics, ...summary.keyPoints, summary.emotionalArc].join(
      ' '
    );

    await indexConversationSummary(userId, {
      id: summary.id,
      text: summaryText,
      topics: summary.mainTopics,
      timestamp: summary.timestamp,
      embedding: summary.embedding,
    });

    log.info('Indexed conversation for future retrieval');
  } catch (indexError) {
    log.warn(`Failed to index conversation (non-blocking): ${indexError}`);
  }
}

/**
 * Finalize learning data
 */
function finalizeLearning(
  userProfile: UserProfile,
  learningEngine: SessionServices['learningEngine']
): UserProfile {
  const log = getLogger();
  const learningData = learningEngine.finalizeSession(userProfile);
  const stats = learningEngine.getSessionStats();

  log.info(
    {
      keyMoments: stats.keyMoments,
      insights: stats.insights,
      detailsCaptured: stats.detailsCaptured,
      topicsDiscussed: stats.topicsDiscussed,
    },
    'Session learning stats'
  );

  return UserLearningEngine.applyLearningToProfile(userProfile, learningData);
}

/**
 * Apply humanizing state updates to profile
 */
async function applyHumanizingState(
  profile: UserProfile,
  updates: HumanizingStateUpdate[],
  userId: string
): Promise<UserProfile> {
  const log = getLogger();

  if (updates.length === 0) {
    return profile;
  }

  try {
    const {
      getHumanizingState,
      mergeHumanizingStateUpdate,
      applyHumanizingStateToProfile,
      logHumanizingStateSummary,
    } = await import('../humanizing-state.js');

    let humanizingState = getHumanizingState(profile);

    for (const update of updates) {
      humanizingState = mergeHumanizingStateUpdate(humanizingState, update);
    }

    const updatedProfile = applyHumanizingStateToProfile(profile, humanizingState);
    logHumanizingStateSummary(humanizingState, userId);
    return updatedProfile;
  } catch (humanizingError) {
    log.warn({ error: String(humanizingError) }, 'Failed to persist humanizing state (non-fatal)');
    return profile;
  }
}

/**
 * Set conversation summary on profile
 */
function setSummaryOnProfile(
  profile: UserProfile,
  summary: Awaited<ReturnType<typeof summarizeConversation>> | null,
  turns: ConversationTurn[]
): UserProfile {
  const log = getLogger();

  if (summary?.keyPoints && summary.keyPoints.length > 0) {
    profile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');
  } else if (turns.length > 0) {
    // Fallback: extract from user turns
    const userTurns = turns.filter((t) => t.role === 'user');
    if (userTurns.length > 0) {
      const topics = userTurns.slice(-3).map((t) => t.content.slice(0, 50).replace(/[.!?]+$/, ''));
      profile.lastConversationSummary = `Discussed: ${topics.join('; ')}`;
      log.info(
        { fallbackSummary: profile.lastConversationSummary.slice(0, 60) },
        '📝 Used fallback summary (LLM summarization unavailable)'
      );
    }
  }

  return profile;
}

/**
 * Persist all state to profile
 */
async function persistAllState(
  profile: UserProfile,
  userId: string,
  sessionId: string,
  services: SessionServices,
  personaId: string | undefined,
  summary: Awaited<ReturnType<typeof summarizeConversation>> | null,
  turns: ConversationTurn[]
): Promise<UserProfile> {
  const log = getLogger();

  // Initialize customData if needed
  if (!profile.customData) {
    profile.customData = {};
  }

  // Persist handoff state
  profile = await persistHandoffState(profile, services.handoffState);

  // Persist cross-session threads
  profile = await persistCrossSessionThreads(profile, services.crossSessionThreader);

  // Persist emotional memory
  profile = await persistEmotionalMemory(profile, services.emotionalMemory);

  // Apply intelligence state
  profile = await persistIntelligenceState(profile, userId);

  // Persist personal journey
  profile = await persistPersonalJourney(profile, userId, summary);

  // Extract human memory signals
  profile = await extractHumanMemorySignals(profile, userId, personaId, turns, summary);

  return profile;
}

/**
 * Persist handoff state to profile
 */
async function persistHandoffState(
  profile: UserProfile,
  handoffState: SessionServices['handoffState']
): Promise<UserProfile> {
  const log = getLogger();

  try {
    const { getMeetingCounts, getLastTopicsPerPersona } =
      await import('../../tools/handoff-state.js');
    const meetingCounts = getMeetingCounts(handoffState);
    const lastTopicsPerPersona = getLastTopicsPerPersona(handoffState);

    (profile.customData as Record<string, unknown>).meetingCounts = meetingCounts;
    (profile.customData as Record<string, unknown>).lastTopicsPerPersona = lastTopicsPerPersona;

    log.debug(
      { meetingCounts: Object.keys(meetingCounts).length },
      'Persisted handoff state to profile'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist handoff state (non-fatal)');
  }

  return profile;
}

/**
 * Persist cross-session threads to profile
 */
async function persistCrossSessionThreads(
  profile: UserProfile,
  crossSessionThreader: SessionServices['crossSessionThreader']
): Promise<UserProfile> {
  const log = getLogger();

  try {
    const threadData = crossSessionThreader.getAllData();
    const openThreadCount = threadData.threads.filter((t) => t.status === 'open').length;
    const pendingFollowUps = threadData.followUps.filter((f) => !f.delivered).length;

    if (openThreadCount > 0 || pendingFollowUps > 0) {
      (profile.customData as Record<string, unknown>).openThreads = threadData.threads;
      (profile.customData as Record<string, unknown>).promisedFollowUps = threadData.followUps;

      log.info(
        { openThreads: openThreadCount, pendingFollowUps },
        'Persisted cross-session threads to profile'
      );
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist cross-session threads (non-fatal)');
  }

  return profile;
}

/**
 * Persist emotional memory to profile
 */
async function persistEmotionalMemory(
  profile: UserProfile,
  emotionalMemory: SessionServices['emotionalMemory']
): Promise<UserProfile> {
  const log = getLogger();

  try {
    const moments = emotionalMemory.exportMoments();
    if (moments.length > 0) {
      // Keep only recent moments (last 50) to avoid profile bloat
      const recentMoments = moments.slice(-50);
      (profile.customData as Record<string, unknown>).emotionalMoments = recentMoments;

      log.info({ momentCount: recentMoments.length }, 'Persisted emotional memory to profile');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist emotional memory (non-fatal)');
  }

  return profile;
}

/**
 * Persist intelligence state to profile
 */
async function persistIntelligenceState(
  profile: UserProfile,
  userId: string
): Promise<UserProfile> {
  const log = getLogger();

  try {
    profile = applyIntelligenceToProfile(profile, userId);
    log.info({ userId }, '🧠 Applied intelligence state to profile');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to apply intelligence state (non-fatal)');
  }

  return profile;
}

/**
 * Persist personal journey data to profile
 */
async function persistPersonalJourney(
  profile: UserProfile,
  userId: string,
  summary: Awaited<ReturnType<typeof summarizeConversation>> | null
): Promise<UserProfile> {
  const log = getLogger();

  try {
    const { getPersonalJourneyForPersistence, updateJourneyFromConversation } =
      await import('../personal-journey/session-integration.js');

    // Update chapter detection from conversation
    if (summary) {
      await updateJourneyFromConversation(userId, {
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
    const journeyData = getPersonalJourneyForPersistence(userId);
    if (journeyData && (journeyData.rhythm || journeyData.seasonal || journeyData.chapters)) {
      profile.personalJourney = journeyData;
      log.info(
        {
          userId,
          hasRhythm: !!journeyData.rhythm,
          hasSeasonal: !!journeyData.seasonal,
          hasChapters: !!journeyData.chapters,
          deliveryRecords: journeyData.deliveryHistory?.length || 0,
        },
        '🌟 Personal journey data persisted to profile'
      );
    }

    // Capture seasonal snapshot if needed
    if (summary) {
      const { captureSeasonalSnapshotIfNeeded } =
        await import('../personal-journey/session-integration.js');
      const captured = await captureSeasonalSnapshotIfNeeded(userId, {
        emotionalState: summary.emotionalArc || 'neutral',
        activeThemes: summary.mainTopics || [],
        keyMoments: summary.keyPoints || [],
      });
      if (captured) {
        log.info({ userId }, '🌸 Seasonal snapshot captured');
      }
    }
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      'Failed to persist personal journey data (non-fatal)'
    );
  }

  return profile;
}

/**
 * Extract human memory signals from conversation
 */
async function extractHumanMemorySignals(
  profile: UserProfile,
  userId: string,
  personaId: string | undefined,
  turns: ConversationTurn[],
  summary: Awaited<ReturnType<typeof summarizeConversation>> | null
): Promise<UserProfile> {
  const log = getLogger();

  try {
    const { extractHumanSignals, mergeSignalsIntoMemory } =
      await import('../../memory/human-signal-extractor.js');

    if (turns.length > 0) {
      const signals = extractHumanSignals(turns, {
        userId,
        personaId: personaId || 'ferni',
        userName: profile.preferredName || profile.name,
        existingMemory: profile.humanMemory,
        sessionEmotion: summary?.emotionalArc,
      });

      const totalSignals = Object.values(signals).reduce((sum, arr) => sum + arr.length, 0);

      if (totalSignals > 0) {
        profile.humanMemory = mergeSignalsIntoMemory(profile.humanMemory, signals);
        log.info(
          {
            userId,
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
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      'Failed to extract human memory signals (non-fatal)'
    );
  }

  return profile;
}

/**
 * Index user memories for semantic search
 */
async function indexUserMemories(userId: string, profile: UserProfile): Promise<void> {
  const log = getLogger();

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

/**
 * Analyze session for outreach opportunities
 */
async function analyzeForOutreach(
  userId: string,
  sessionId: string,
  personaId: string | undefined,
  services: SessionServices,
  turns: ConversationTurn[],
  summary: Awaited<ReturnType<typeof summarizeConversation>> | null
): Promise<void> {
  const log = getLogger();

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

/**
 * Cleanup core components
 */
async function cleanupCoreComponents(sessionId: string): Promise<void> {
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

/**
 * Cleanup all intelligence engines
 */
async function cleanupIntelligenceEnginesAll(
  validatedUserId: string | undefined,
  cleanupEngineKey: string
): Promise<void> {
  const log = getLogger();

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

/**
 * Capture growth snapshot at session end
 */
async function captureGrowthSnapshot(userId: string, services: SessionServices): Promise<void> {
  const log = getLogger();

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
 * Clear life data cache
 */
async function clearLifeDataCache(userId: string): Promise<void> {
  const log = getLogger();

  try {
    const { getLifeDataStore } = await import('../stores/life-data-store.js');
    getLifeDataStore().clearUserCache(userId);
  } catch (error) {
    log.debug({ error }, 'Failed to clear life data cache (non-blocking)');
  }
}

/**
 * Finalize realtime memory
 */
async function finalizeRealtimeMemory(userId: string, conversationId: string): Promise<void> {
  const log = getLogger();

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

/**
 * Flush unified trust persistence
 */
async function flushTrustPersistence(userId: string): Promise<void> {
  try {
    await onSessionEndUnified(userId);
  } catch {
    // Non-critical
  }
}

// ============================================================================
// SUPERHUMAN OUTREACH INTELLIGENCE
// ============================================================================

/**
 * Process accumulated superhuman signals at session end.
 *
 * This analyzes signals collected throughout the conversation and may
 * trigger intelligent proactive outreach if patterns indicate need:
 * - Crisis + voice distress → Full team support
 * - Low energy + Sunday evening → Preemptive habit support
 * - Values conflict + emotional peak → Peter + Ferni insight
 *
 * @param userId - User ID
 * @param userProfile - User's profile for relationship stage
 */
async function processAccumulatedOutreachSignals(
  userId: string,
  userProfile: UserProfile
): Promise<void> {
  const log = getLogger();

  try {
    // Determine relationship stage from profile
    const relationshipStage = determineRelationshipStage(userProfile);

    // Process accumulated signals and potentially trigger outreach
    const result = await processAccumulatedSignals(userId, {
      relationshipStage,
      preferredName: userProfile.name || undefined,
      // TODO: Track last outreach time in user profile
    });

    if (result?.success) {
      log.info(
        {
          userId,
          outreachId: result.outreachId,
          channel: result.channel,
          personas: result.personas,
        },
        '🧠 Superhuman outreach triggered at session end'
      );
    }
  } catch (error) {
    // Non-blocking - outreach is not critical path
    log.debug({ error: String(error), userId }, 'Outreach signal processing skipped');
  }
}

/**
 * Determine relationship stage from user profile metrics.
 */
function determineRelationshipStage(
  profile: UserProfile
): 'new' | 'building' | 'established' | 'deep' {
  const conversationCount = profile.totalConversations || 0;
  const firstContactTime = profile.firstContact instanceof Date
    ? profile.firstContact.getTime()
    : typeof profile.firstContact === 'string'
      ? new Date(profile.firstContact).getTime()
      : 0;
  const daysSinceFirst = firstContactTime
    ? Math.floor((Date.now() - firstContactTime) / (24 * 60 * 60 * 1000))
    : 0;
  // Count heavy emotional moments as "vulnerable moments"
  const vulnerableMoments = profile.keyMoments?.filter((m) => m.emotionalWeight === 'heavy').length || 0;

  // Deep: 60+ conversations, 45+ days, 10+ vulnerable moments
  if (conversationCount >= 60 && daysSinceFirst >= 45 && vulnerableMoments >= 10) {
    return 'deep';
  }

  // Established: 30+ conversations, 21+ days
  if (conversationCount >= 30 && daysSinceFirst >= 21) {
    return 'established';
  }

  // Building: 10+ conversations, 5+ days
  if (conversationCount >= 10 && daysSinceFirst >= 5) {
    return 'building';
  }

  return 'new';
}
