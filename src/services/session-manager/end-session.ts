/**
 * End Session Handler
 *
 * Orchestrates the session end lifecycle by coordinating:
 * - Conversation summarization (via summarization.ts)
 * - State persistence (via state-persistence.ts)
 * - Cleanup operations (via session-end-cleanup.ts)
 *
 * @module session-manager/end-session
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

// Session types
import type { GlobalServices, SessionServices } from '../types.js';
import type { HumanizingStateUpdate } from '../humanizing-state.js';
import type { ConversationTurn } from '../../memory/index.js';

// Summarization module
import {
  generateSummary,
  indexSummaryForRetrieval,
  createFallbackSummary,
  type ConversationSummary,
} from './summarization.js';

// State persistence module
import {
  persistAllState,
  applyHumanizingState,
} from './state-persistence.js';

// Cleanup module
import {
  cleanupCoreComponents,
  cleanupIntelligenceEnginesAll,
  captureGrowthSnapshot,
  clearLifeDataCache,
  finalizeRealtimeMemory,
  flushTrustPersistence,
  indexUserMemories,
  analyzeForOutreach,
  updateVoiceSketch,
  persistSocialGraphOnEnd,
  promoteSTMToFirestore,
} from './session-end-cleanup.js';

// Intelligence imports
import { UserLearningEngine } from '../../intelligence/index.js';

// Intelligence persistence
import { stopAutoSave } from '../intelligence-persistence.js';

// Persistence metrics
import { persistenceMetrics } from '../analytics/persistence-metrics.js';

// Superhuman outreach intelligence
import { processAccumulatedSignals } from '../conversation-thread/superhuman-outreach-intelligence.js';

// Conversation quality scoring ("Better Than Human" - automated session quality measurement)
import { processSessionEnd as scoreConversation, type SessionData } from '../automation/conversation-scorer.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Handle the session end lifecycle.
 *
 * This orchestrates:
 * 1. User session finalization (if authenticated)
 * 2. Core component cleanup
 * 3. Intelligence engine cleanup
 * 4. Growth snapshot capture
 * 5. Dynamic memory promotion
 * 6. Realtime memory finalization
 * 7. Trust persistence flush
 * 8. Superhuman outreach processing
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

  // 🧠 DYNAMIC MEMORY: Promote STM to Firestore at session end
  if (validatedUserId) {
    await promoteSTMToFirestore(sessionId, validatedUserId);
  } else {
    log.warn({ sessionId, userId }, '🧠 [MEMORY-AUDIT] SKIPPING STM promotion - no validatedUserId');
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
  if (validatedUserId && services.userProfile) {
    await processAccumulatedOutreachSignals(validatedUserId, services.userProfile);
  }

  // Record metrics
  const sessionEndDurationMs = Date.now() - sessionEndStartTime;
  persistenceMetrics.recordSessionEnd(sessionId, sessionEndDurationMs);

  log.info(`Session ${sessionId} ended and cleaned up`);
}

// ============================================================================
// USER SESSION FINALIZATION
// ============================================================================

/**
 * Finalize session for an authenticated user.
 *
 * Handles summarization, learning finalization, state persistence,
 * and profile saving.
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
    let summary: ConversationSummary | null = null;
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

    // Set conversation summary on profile
    updatedProfile = setSummaryOnProfile(updatedProfile, summary, turns);

    // Persist all state
    updatedProfile = await persistAllState({
      profile: updatedProfile,
      userId: validatedUserId,
      sessionId,
      services,
      personaId,
      summary,
      turns,
    });

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
    await updateVoiceSketch(validatedUserId, sessionId, sessionStartTime);

    // 🧠 FINAL PERSISTENCE: Save social graph and clear rate limits
    await persistSocialGraphOnEnd(validatedUserId);

    // 📊 CONVERSATION QUALITY SCORING: Score this session for quality metrics
    await scoreConversationQuality({
      sessionId,
      userId: validatedUserId,
      personaId: personaId || 'ferni',
      sessionStartTime,
      turns,
      userProfile: updatedProfile,
    });
  } catch (error) {
    log.warn(`Failed to save conversation summary/learning: ${error}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Finalize learning data and apply to profile.
 */
function finalizeLearning(
  userProfile: UserProfile,
  learningEngine: SessionServices['learningEngine']
): UserProfile {
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
 * Set conversation summary on profile (with fallback).
 */
function setSummaryOnProfile(
  profile: UserProfile,
  summary: ConversationSummary | null,
  turns: ConversationTurn[]
): UserProfile {
  if (summary?.keyPoints && summary.keyPoints.length > 0) {
    profile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');
  } else if (turns.length > 0) {
    // Fallback: extract from user turns
    const fallbackSummary = createFallbackSummary(turns);
    if (fallbackSummary) {
      profile.lastConversationSummary = fallbackSummary;
      log.info(
        { fallbackSummary: fallbackSummary.slice(0, 60) },
        '📝 Used fallback summary (LLM summarization unavailable)'
      );
    }
  }

  return profile;
}

// ============================================================================
// SUPERHUMAN OUTREACH INTELLIGENCE
// ============================================================================

/**
 * Process accumulated superhuman signals at session end.
 *
 * Analyzes signals collected throughout the conversation and may
 * trigger intelligent proactive outreach if patterns indicate need.
 */
async function processAccumulatedOutreachSignals(
  userId: string,
  userProfile: UserProfile
): Promise<void> {
  try {
    const relationshipStage = determineRelationshipStage(userProfile);

    const result = await processAccumulatedSignals(userId, {
      relationshipStage,
      preferredName: userProfile.name || undefined,
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
  const firstContactTime =
    profile.firstContact instanceof Date
      ? profile.firstContact.getTime()
      : typeof profile.firstContact === 'string'
        ? new Date(profile.firstContact).getTime()
        : 0;
  const daysSinceFirst = firstContactTime
    ? Math.floor((Date.now() - firstContactTime) / (24 * 60 * 60 * 1000))
    : 0;
  const vulnerableMoments =
    profile.keyMoments?.filter((m) => m.emotionalWeight === 'heavy').length || 0;

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

// ============================================================================
// CONVERSATION QUALITY SCORING
// ============================================================================

/**
 * Score conversation quality at session end.
 *
 * Maps session data to the SessionData format expected by the scorer
 * and triggers quality scoring for the "Better than Human" metrics.
 */
async function scoreConversationQuality(params: {
  sessionId: string;
  userId: string;
  personaId: string;
  sessionStartTime: number;
  turns: ConversationTurn[];
  userProfile: UserProfile;
}): Promise<void> {
  const { sessionId, userId, personaId, sessionStartTime, turns, userProfile } = params;

  try {
    // Map ConversationTurn[] to TurnData[]
    const turnData: SessionData['turns'] = turns.map((turn, index) => ({
      speaker: turn.role === 'user' ? 'user' : 'agent',
      text: turn.content,
      timestamp: new Date(sessionStartTime + index * 30000).toISOString(), // Approximate timestamps
      isQuestion: turn.content.includes('?'),
    }));

    // Calculate session duration
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);

    // Build session data for scoring (trust/mood fields are optional)
    const sessionData: SessionData = {
      sessionId,
      userId,
      personaId,
      duration,
      turns: turnData,
      // Trust progression is tracked via relationship stages, not numeric scores
      // The scorer will compute trust metrics from turn analysis
    };

    // Score the conversation
    await scoreConversation(sessionData);

    log.debug(
      { sessionId, userId, turnCount: turns.length, duration },
      '📊 Conversation quality scored'
    );
  } catch (error) {
    // Non-critical failure - just log and continue
    log.debug({ error: String(error), sessionId }, 'Conversation scoring skipped');
  }
}
