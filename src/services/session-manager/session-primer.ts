/**
 * Session Primer
 *
 * Generates priming context for returning users to enable
 * "better than human" continuity across sessions.
 *
 * @module session-manager/session-primer
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

// Memory imports
import {
  buildMemoryIndex,
  getConversationPrimingMemories,
  getSessionPrimer,
} from '../../memory/index.js';

import type { MemoryItem } from '../../memory/advanced-retrieval.js';

// Intelligence imports
import type {
  getConversationPatternAnalyzer,
  getProactiveInsightEngine,
  getResponseQualityTracker,
} from '../../intelligence/index.js';
import { buildSuperhumanContext, type SuperhumanContext } from '../../intelligence/index.js';

/**
 * Session priming data for returning users
 */
export interface SessionPriming {
  suggestedOpener: string;
  openThreads: Array<{
    topic: string;
    urgency: 'high' | 'medium' | 'low';
  }>;
  pendingFollowUps: Array<{
    topic: string;
    dueDate?: string;
  }>;
  emotionalContext?: {
    trend: string;
    lastEmotion: string;
  };
  relationshipContext?: {
    stage: string;
    sessionsCount: number;
  };
  naturalGreetingHints: string[];
}

/**
 * Options for generating session priming
 */
export interface SessionPrimingOptions {
  userId: string;
  personaId: string;
  userProfile: UserProfile;
}

/**
 * Generate session priming for a returning user
 *
 * This builds context to help the AI:
 * - Remember open threads and promised follow-ups
 * - Surface emotional context from previous sessions
 * - Provide natural greeting hints
 * - Warm the memory index for semantic retrieval
 */
export async function generateSessionPriming(
  options: SessionPrimingOptions
): Promise<SessionPriming | undefined> {
  const { userId, personaId, userProfile } = options;
  const log = getLogger();

  try {
    const primer = getSessionPrimer();

    // Get recent conversation summaries for context
    const recentSummaries = userProfile.conversationSummaries?.slice(-5) || [];

    // ========================================================================
    // MEMORY INDEX WARMING - Build index at session START for returning users
    // This ensures semantic retrieval works from turn 1, not just after indexing
    // ========================================================================
    const primingMemories = await warmMemoryIndex(userId, personaId, userProfile, log);

    // Generate priming context with actual memories from vector store
    const primingResult = await primer.generatePrimingContext(
      userProfile,
      primingMemories,
      recentSummaries
    );

    const sessionPriming: SessionPriming = {
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

    log.info(
      {
        openThreads: sessionPriming.openThreads.length,
        pendingFollowUps: sessionPriming.pendingFollowUps.length,
        suggestedOpenerPreview: sessionPriming.suggestedOpener.slice(0, 50),
      },
      '🎯 Session priming generated for returning user'
    );

    return sessionPriming;
  } catch (primingError) {
    log.debug({ error: String(primingError) }, 'Failed to generate session priming (non-blocking)');
    return undefined;
  }
}

/**
 * Warm the memory index for returning users
 */
async function warmMemoryIndex(
  userId: string,
  personaId: string,
  userProfile: UserProfile,
  log: ReturnType<typeof getLogger>
): Promise<MemoryItem[]> {
  try {
    // Build memory index from user profile (fast if already built)
    await buildMemoryIndex(userId, userProfile);

    // Get salient memories for session priming (commitments, emotional moments, recent topics)
    const primingMemories = await getConversationPrimingMemories(userId, personaId, {
      maxMemories: 5,
      includeCommitments: true,
      includeRecentTopics: true,
      sessionCount: userProfile.totalConversations || 0,
    });

    if (primingMemories.length > 0) {
      log.info(
        { userId, memoriesLoaded: primingMemories.length },
        '🧠 Memory index warmed with salient memories for session priming'
      );
    }

    return primingMemories;
  } catch (memoryWarmupError) {
    log.debug(
      { error: String(memoryWarmupError) },
      'Memory warmup failed (non-blocking) - continuing with empty memories'
    );
    return [];
  }
}

/**
 * Options for generating proactive insights
 */
export interface ProactiveInsightsOptions {
  userProfile: UserProfile;
  patternAnalyzer: ReturnType<typeof getConversationPatternAnalyzer>;
  responseQualityTracker: ReturnType<typeof getResponseQualityTracker>;
  proactiveEngine: ReturnType<typeof getProactiveInsightEngine>;
}

/**
 * Generate proactive insights for returning users
 *
 * This creates proactive check-ins based on user history
 */
export function generateProactiveInsights(options: ProactiveInsightsOptions): void {
  const { userProfile, patternAnalyzer, responseQualityTracker, proactiveEngine } = options;
  const log = getLogger();

  try {
    const patternData = patternAnalyzer.analyzePatterns();
    const responsePrefs = responseQualityTracker.calculatePreferences();

    const insightResult = proactiveEngine.generateInsights(userProfile, patternData, responsePrefs);

    if (insightResult.highPriorityCount > 0) {
      log.info(
        {
          totalInsights: insightResult.insights.length,
          highPriority: insightResult.highPriorityCount,
          suggestedStarter: insightResult.suggestedConversationStarter?.slice(0, 50),
        },
        'Generated proactive insights for returning user'
      );
    }
  } catch (insightError) {
    log.debug(
      { error: String(insightError) },
      'Failed to generate proactive insights (non-blocking)'
    );
  }
}

/**
 * Options for building superhuman context
 */
export interface SuperhumanContextOptions {
  userProfile: UserProfile;
}

/**
 * Build superhuman memory context for "Better than Human" proactive intelligence
 *
 * Surfaces important dates, comfort patterns, growth celebrations, etc.
 */
export function buildSuperhumanMemoryContext(
  options: SuperhumanContextOptions
): SuperhumanContext | undefined {
  const { userProfile } = options;
  const log = getLogger();

  try {
    const superhumanContext = buildSuperhumanContext(userProfile, {
      sessionCount: userProfile.totalConversations || 0,
      recentTopics: userProfile.preferredTopics || [],
    });

    if (superhumanContext.insights.length > 0) {
      log.info(
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

    return superhumanContext;
  } catch (superhumanError) {
    log.debug(
      { error: String(superhumanError) },
      'Failed to generate superhuman memory context (non-blocking)'
    );
    return undefined;
  }
}
