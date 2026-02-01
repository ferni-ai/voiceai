/**
 * Feedback Context Builder
 *
 * Injects recent user feedback into the conversation context so the agent
 * can naturally adjust its style based on what's resonating (or not).
 *
 * This enables the agent to:
 * - Acknowledge when advice landed well ("I'm glad that resonated...")
 * - Adjust tone when things feel heavy ("Let me lighten up a bit...")
 * - Course-correct when off track ("Let me try a different angle...")
 *
 * The context is subtle - we don't want the agent to explicitly reference
 * the feedback mechanism, just naturally adjust based on it.
 *
 * @module intelligence/context-builders/feedback-context
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getSessionFeedback,
  type ConversationFeedback,
  type FeedbackReaction,
} from '../../services/feedback/index.js';

const log = createLogger({ module: 'FeedbackContextBuilder' });

// ============================================================================
// TYPES
// ============================================================================

export interface FeedbackContextResult {
  /** Context string to inject into LLM prompt */
  context: string;
  /** Recent feedback summary */
  summary: {
    recentCount: number;
    resonatedCount: number;
    helpfulCount: number;
    tooMuchCount: number;
    offTrackCount: number;
    skippedCount: number;
    lastReaction?: FeedbackReaction;
    lastReactionTurnCount?: number;
    needsAdjustment: boolean;
    adjustmentType?: 'lighten' | 'redirect' | 'continue' | 'acknowledge';
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

// How many recent feedback items to consider
const RECENT_FEEDBACK_LIMIT = 10;

// Minimum feedback count before we start injecting context
const MIN_FEEDBACK_FOR_CONTEXT = 1;

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build feedback context for injection into LLM prompt.
 *
 * @param userId - User ID
 * @param sessionId - Current session ID
 * @returns Context string and summary
 */
export async function buildFeedbackContext(
  userId: string,
  sessionId: string
): Promise<FeedbackContextResult> {
  const emptyResult: FeedbackContextResult = {
    context: '',
    summary: {
      recentCount: 0,
      resonatedCount: 0,
      helpfulCount: 0,
      tooMuchCount: 0,
      offTrackCount: 0,
      skippedCount: 0,
      needsAdjustment: false,
    },
  };

  if (!userId || !sessionId) {
    return emptyResult;
  }

  try {
    // Get feedback from current session only
    const feedback = await getSessionFeedback(userId, sessionId);

    if (feedback.length < MIN_FEEDBACK_FOR_CONTEXT) {
      return emptyResult;
    }

    // Build summary
    const summary = analyzeFeedback(feedback);

    // Build context string based on summary
    const context = buildContextString(summary);

    log.debug(
      {
        userId,
        sessionId,
        recentCount: summary.recentCount,
        lastReaction: summary.lastReaction,
        needsAdjustment: summary.needsAdjustment,
        adjustmentType: summary.adjustmentType,
      },
      '📊 Feedback context built'
    );

    return { context, summary };
  } catch (error) {
    log.warn({ error, userId, sessionId }, 'Failed to build feedback context');
    return emptyResult;
  }
}

// ============================================================================
// ANALYSIS
// ============================================================================

function analyzeFeedback(feedback: ConversationFeedback[]): FeedbackContextResult['summary'] {
  // Take most recent feedback items
  const recent = feedback.slice(0, RECENT_FEEDBACK_LIMIT);

  const summary: FeedbackContextResult['summary'] = {
    recentCount: recent.length,
    resonatedCount: recent.filter((f) => f.reaction === 'resonated').length,
    helpfulCount: recent.filter((f) => f.reaction === 'helpful').length,
    tooMuchCount: recent.filter((f) => f.reaction === 'too_much').length,
    offTrackCount: recent.filter((f) => f.reaction === 'off_track').length,
    skippedCount: recent.filter((f) => f.reaction === 'skipped' || f.reaction === null).length,
    needsAdjustment: false,
  };

  // Get most recent non-skipped feedback
  const lastMeaningful = recent.find((f) => f.reaction && f.reaction !== 'skipped');

  if (lastMeaningful) {
    summary.lastReaction = lastMeaningful.reaction;
    summary.lastReactionTurnCount = lastMeaningful.context.turnCount;

    // Determine if we need adjustment and what type
    if (lastMeaningful.reaction === 'too_much') {
      summary.needsAdjustment = true;
      summary.adjustmentType = 'lighten';
    } else if (lastMeaningful.reaction === 'off_track') {
      summary.needsAdjustment = true;
      summary.adjustmentType = 'redirect';
    } else if (lastMeaningful.reaction === 'resonated' || lastMeaningful.reaction === 'helpful') {
      // Positive feedback - subtle acknowledgment, continue this direction
      summary.adjustmentType = summary.resonatedCount > 1 ? 'continue' : 'acknowledge';
    }
  }

  return summary;
}

// ============================================================================
// CONTEXT STRING BUILDING
// ============================================================================

function buildContextString(summary: FeedbackContextResult['summary']): string {
  if (summary.recentCount === 0) {
    return '';
  }

  const parts: string[] = [];

  // Add general engagement insight
  const engagementRate =
    (summary.resonatedCount + summary.helpfulCount) /
    (summary.recentCount - summary.skippedCount || 1);

  // Build subtle guidance based on last reaction
  if (summary.lastReaction === 'too_much') {
    parts.push(
      `[Recent feedback suggests the conversation may be feeling heavy. ` +
        `Consider lightening the tone, taking a gentler approach, or checking in briefly ` +
        `before going deeper. The user may need some breathing room.]`
    );
  } else if (summary.lastReaction === 'off_track') {
    parts.push(
      `[The user indicated the conversation went off track recently. ` +
        `Consider asking what would be most helpful right now, or gently redirecting ` +
        `to what matters most to them. Don't mention receiving feedback - just adjust naturally.]`
    );
  } else if (summary.lastReaction === 'resonated') {
    parts.push(
      `[Your recent approach landed well with the user. ` +
        `Continue in this direction - the depth and tone seem to be working.]`
    );
  } else if (summary.lastReaction === 'helpful') {
    parts.push(
      `[The user found your recent guidance helpful. ` +
        `You're on the right track - keep providing practical value.]`
    );
  }

  // Add pattern insight if we have enough data
  if (summary.recentCount >= 3) {
    if (engagementRate >= 0.7) {
      parts.push(
        `[Overall: The conversation is resonating well (${Math.round(engagementRate * 100)}% positive feedback).]`
      );
    } else if (summary.tooMuchCount >= 2) {
      parts.push(
        `[Pattern: User has indicated things feeling heavy multiple times. ` +
          `Prioritize lightness and checking in over deep exploration.]`
      );
    } else if (summary.offTrackCount >= 2) {
      parts.push(
        `[Pattern: User has felt off-track multiple times. ` +
          `Be more attentive to following their lead rather than exploring tangents.]`
      );
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// CONTEXT BUILDER REGISTRATION
// ============================================================================

/**
 * Register this context builder with the context system.
 *
 * This builder runs at priority 50 (after core context, before personalization)
 * and adds feedback-based context to help the agent adjust its approach.
 */
export const feedbackContextBuilder = {
  name: 'feedback',
  priority: 50,
  build: buildFeedbackContext,
};

export default feedbackContextBuilder;
