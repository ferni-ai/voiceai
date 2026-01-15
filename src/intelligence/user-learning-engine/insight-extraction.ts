/**
 * Insight Extraction Module
 *
 * Extracts explicit and implicit insights from user messages:
 * - Goals
 * - Concerns
 * - Topic interests
 *
 * @module user-learning-engine/insight-extraction
 */

import type { IntentResult } from '../detectors/intent.js';
import type { LearningInsight } from './types.js';

// ============================================================================
// PATTERNS
// ============================================================================

/** Goal mention patterns */
const GOAL_PATTERNS = [
  /i('m| am) (trying|planning|hoping|wanting) to (save|retire|buy|pay off)/i,
  /my goal is to/i,
  /i want to (be able to|have|achieve)/i,
];

/** Concern mention patterns */
const CONCERN_PATTERNS = [
  /i('m| am) (worried|concerned|anxious|scared) (about|that)/i,
  /my (biggest|main|primary) (worry|concern|fear)/i,
];

/** Interest intents */
const INTEREST_INTENTS = [
  'request_info',
  'seeking_education',
  'asking_question',
  'requesting_info',
];

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract explicit insights from user statements
 */
export function extractExplicitInsights(
  message: string,
  intent: IntentResult,
  topicsDiscussed: string[],
  sessionInsights: LearningInsight[]
): void {
  const messageLower = message.toLowerCase();

  // Goal mentions
  for (const pattern of GOAL_PATTERNS) {
    const match = messageLower.match(pattern);
    if (match) {
      sessionInsights.push({
        type: 'goal',
        key: 'mentioned_goal',
        value: message.slice(0, 200),
        confidence: 0.9,
        source: 'explicit',
        capturedAt: new Date(),
        context: intent.primary,
      });
      break;
    }
  }

  // Concern mentions
  for (const pattern of CONCERN_PATTERNS) {
    if (pattern.test(messageLower)) {
      sessionInsights.push({
        type: 'concern',
        key: 'explicit_concern',
        value: message.slice(0, 200),
        confidence: 0.9,
        source: 'explicit',
        capturedAt: new Date(),
      });
      break;
    }
  }

  // Topic interest (positive sentiment about topics)
  if (INTEREST_INTENTS.includes(intent.primary)) {
    sessionInsights.push({
      type: 'topic_interest',
      key: 'interested_topic',
      value: topicsDiscussed[topicsDiscussed.length - 1] || 'general',
      confidence: 0.6,
      source: 'inferred',
      capturedAt: new Date(),
    });
  }
}

/**
 * Capture an external insight (from tasks, conversation manager, etc.)
 * This allows other modules to feed insights into the learning engine
 */
export function captureExternalInsight(
  sessionInsights: LearningInsight[],
  insight: Omit<LearningInsight, 'capturedAt'>
): void {
  sessionInsights.push({
    ...insight,
    capturedAt: new Date(),
  });
}
