/**
 * Turn Learning & Recording
 *
 * Handles trust systems data recording and collective learning.
 * Extracted from turn-handler.ts for maintainability.
 *
 * Responsibilities:
 * - Trust systems data recording
 * - Collective learning signal recording
 * - Engagement analysis
 *
 * @module voice-agent/turn-learning
 */

import { log } from '@livekit/agents';
import {
  analyzeUserEngagement,
  recordResponseForLearning,
  type ConversationSignalContext,
} from '../../intelligence/index.js';
import { learnTemporalPattern } from '../../intelligence/context-builders/temporal-intelligence.js';
import { recordSharedMoment } from '../../intelligence/context-builders/deep-relationship.js';
import { recordTrustSystemsData } from './index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LearningContext {
  /** User ID (required for recording) */
  userId: string | null;
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** Turn count */
  turnCount: number;
  /** User message text */
  userText: string;
  /** Emotional analysis result */
  emotionalResult: {
    primary: string;
    intensity: number;
    distressLevel: number;
  };
  /** Humanizing result with relationship stage */
  humanizingResult?: {
    relationship?: { stage?: string };
  };
  /** Context injections from turn processing */
  injections: Array<{ category: string; content: string }>;
  /** Full turn processing result (for trust systems) */
  turnResult: {
    emotional: { primary?: string; intensity?: number };
    context: {
      humanizingResult?: {
        mood?: unknown;
        relationship?: unknown;
      };
    };
  };
}

export interface LearningResult {
  /** Whether trust systems data was recorded */
  trustRecorded: boolean;
  /** Whether collective learning signal was recorded */
  learningRecorded: boolean;
}

// ============================================================================
// TRUST SYSTEMS RECORDING
// ============================================================================

/**
 * Record data to trust systems.
 *
 * This feeds the "Better Than Human" trust systems:
 * - Reading between lines
 * - Boundary memory
 * - Growth reflection
 * - Small wins
 */
export async function recordTurnTrustData(ctx: LearningContext): Promise<boolean> {
  if (!ctx.userId) {
    return false;
  }

  try {
    await recordTrustSystemsData({
      userId: ctx.userId,
      userText: ctx.userText,
      result: ctx.turnResult,
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// COLLECTIVE LEARNING
// ============================================================================

/**
 * Record signal for collective learning / community insights.
 *
 * This feeds the collective learning system that improves
 * responses across all users based on engagement patterns.
 */
export async function recordCollectiveLearning(ctx: LearningContext): Promise<boolean> {
  const logger = log();

  if (!ctx.userId || !ctx.sessionId) {
    return false;
  }

  try {
    // Extract topic from injections if available
    const topicInjection = ctx.injections.find(
      (i) => i.category === 'topics' || i.content.includes('topic')
    );
    const topic = topicInjection?.content.split(' ')[0] || 'general';

    // Build context for collective learning
    const learningRelationship = ctx.humanizingResult?.relationship;
    const learningContext: ConversationSignalContext = {
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      personaId: ctx.personaId,
      turnNumber: ctx.turnCount,
      emotion: ctx.emotionalResult.primary || 'neutral',
      topic,
      relationshipStage: learningRelationship?.stage || 'unknown',
    };

    // Create a simplified emotion result for engagement analysis
    const valence = ctx.emotionalResult.intensity > 0.5 ? 'positive' : 'neutral';
    const emotionForEngagement = {
      primary: ctx.emotionalResult.primary as 'neutral',
      intensity: ctx.emotionalResult.intensity,
      valence: valence as 'positive' | 'neutral' | 'negative',
      distressLevel: ctx.emotionalResult.distressLevel || 0,
      confidence: 0.8,
      markers: [] as string[],
      suggestedTone: 'warm' as 'warm',
    };

    // Analyze user engagement based on their message
    const engagement = analyzeUserEngagement(
      ctx.userText,
      null, // Previous emotion (not tracked here)
      emotionForEngagement
    );

    // Record the response signal (async, non-blocking)
    void recordResponseForLearning(
      learningContext,
      ctx.injections
        .map((i) => i.content)
        .join(' ')
        .slice(0, 500), // Summarize context injections
      engagement,
      {
        hadPersonalShare: ctx.injections.some(
          (i) => i.content.includes('personal') || i.content.includes('story')
        ),
        hadQuirk: ctx.injections.some(
          (i) => i.content.includes('quirk') || i.content.includes('playful')
        ),
        hadTeamReference: ctx.injections.some(
          (i) => i.content.includes('team') || i.content.includes('handoff')
        ),
      }
    );

    logger.debug(
      { emotion: ctx.emotionalResult.primary, topic: learningContext.topic },
      'Collective learning signal recorded'
    );

    return true;
  } catch (learningError) {
    logger.debug({ error: String(learningError) }, 'Collective learning recording (non-critical)');
    return false;
  }
}

// ============================================================================
// COMBINED LEARNING
// ============================================================================

/**
 * Record all learning data (trust systems + collective learning + temporal patterns).
 *
 * This is the main entry point for recording learning data during turn processing.
 * Also triggers:
 * - Temporal pattern learning (when the user engages, what topics at what times)
 * - Shared moment detection (inside jokes, meaningful phrases, callbacks)
 */
export async function recordAllLearningData(ctx: LearningContext): Promise<LearningResult> {
  const logger = log();

  // Core learning (existing)
  const [trustRecorded, learningRecorded] = await Promise.all([
    recordTurnTrustData(ctx),
    recordCollectiveLearning(ctx),
  ]);

  // Better Than Human learning (new) - fire and forget to not block turn processing
  // PERFORMANCE: Rate-limited writes to avoid Firestore costs and latency
  if (ctx.userId) {
    // Learn temporal patterns every 5 turns (saves 80% of writes)
    // Patterns are aggregated, so we don't need every single turn
    if (ctx.turnCount % 5 === 0) {
      void learnTemporalPattern(ctx.userId, {
        emotion: ctx.emotionalResult.primary || 'neutral',
        topic: ctx.injections.find((i) => i.category === 'topics')?.content?.split(' ')[0],
      }).catch((err) => {
        logger.debug({ error: String(err) }, 'Temporal pattern learning (non-critical)');
      });
    }

    // Check for shared moments (phrases, jokes, meaningful exchanges)
    // Only on high-emotional turns AND rate-limited to every 3rd qualifying turn
    const isHighEmotionTurn =
      ctx.emotionalResult.intensity > 0.6 ||
      ctx.injections.some(
        (i) =>
          i.content.includes('joke') ||
          i.content.includes('laugh') ||
          i.content.includes('meaningful')
      );

    if (isHighEmotionTurn && ctx.turnCount % 3 === 0) {
      void recordSharedMoment(ctx.userId, {
        type: 'callback_moment',
        content: ctx.emotionalResult.primary || 'connection',
        whatTheySaid: ctx.userText.slice(0, 200),
        triggers: [ctx.emotionalResult.primary || 'emotional_moment'],
        significance: ctx.emotionalResult.intensity > 0.8 ? 'meaningful' : 'warm',
      }).catch((err) => {
        logger.debug({ error: String(err) }, 'Shared moment recording (non-critical)');
      });
    }
  }

  return {
    trustRecorded,
    learningRecorded,
  };
}
