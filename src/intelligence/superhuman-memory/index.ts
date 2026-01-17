/**
 * Superhuman Memory Intelligence
 *
 * "Better than human" means remembering what matters at the right moment.
 * This module transforms stored memories into proactive intelligence:
 *
 * - Proactive Date Awareness: "Happy birthday!" / "I know this week is hard..."
 * - Comfort Pattern Injection: Apply what helps when stress is detected
 * - Growth Arc Celebration: "Look how far you've come!"
 * - Topic Absence Detection: Notice what's NOT being said
 * - Inside Joke Surfacing: Relationship texture callbacks
 * - Voice Tone Memory: Energy/pace patterns over time
 *
 * Philosophy: A great friend doesn't just remember - they remember at the
 * right moment, in the right way, without being asked.
 *
 * @module intelligence/superhuman-memory
 */

import type { UserProfile } from '../../types/user-profile.js';
import type {
  ProactiveInsight,
  ComfortGuidance,
  TopicAbsenceInsight,
  SuperhumanContext,
  TemporalContextResult,
} from './types.js';

// Import all sub-modules
import { checkUpcomingDates } from './date-awareness.js';
import { getComfortGuidance } from './comfort-patterns.js';
import { findCelebratableGrowth } from './growth-celebration.js';
import { detectTopicAbsences } from './topic-absence.js';
import { findSurfaceableJokes } from './inside-jokes.js';
import { getTemporalContext } from './temporal-context.js';
import { recordVoicePattern, analyzeVoicePatterns } from './voice-patterns.js';
import {
  markInsightDelivered,
  wasRecentlyDelivered,
  cleanupDeliveryRecords,
} from './delivery-tracking.js';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  ProactiveInsight,
  ComfortGuidance,
  TopicAbsenceInsight,
  VoicePatternObservation,
  SuperhumanContext,
  TemporalContextResult,
} from './types.js';

// ============================================================================
// FUNCTION EXPORTS
// ============================================================================

// Date awareness
export { checkUpcomingDates } from './date-awareness.js';

// Comfort patterns
export { getComfortGuidance } from './comfort-patterns.js';

// Growth celebration
export { findCelebratableGrowth } from './growth-celebration.js';

// Topic absence
export { detectTopicAbsences } from './topic-absence.js';

// Inside jokes
export { findSurfaceableJokes } from './inside-jokes.js';

// Temporal context
export { getTemporalContext } from './temporal-context.js';

// Voice patterns
export {
  recordVoicePattern,
  analyzeVoicePatterns,
  clearVoicePatternHistory,
} from './voice-patterns.js';

// Delivery tracking
export {
  markInsightDelivered,
  wasRecentlyDelivered,
  cleanupDeliveryRecords,
  getDeliveryCount,
  clearAllDeliveryRecords,
} from './delivery-tracking.js';

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build complete superhuman memory context for a session
 */
export function buildSuperhumanContext(
  profile: UserProfile | null,
  options: {
    detectedEmotion?: string;
    detectedStressLevel?: number;
    currentTopic?: string;
    recentTopics?: string[];
    sessionCount?: number;
    conversationContext?: string;
  } = {}
): SuperhumanContext {
  const humanMemory = profile?.humanMemory;

  // Gather all insights
  const dateInsights = checkUpcomingDates(humanMemory);
  const growthInsights = findCelebratableGrowth(humanMemory, options.currentTopic);
  const jokeInsights = findSurfaceableJokes(humanMemory, options.conversationContext);

  const allInsights = [...dateInsights, ...growthInsights, ...jokeInsights];

  // Sort by priority
  allInsights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Get comfort guidance
  const comfortGuidance = getComfortGuidance(
    humanMemory,
    options.detectedEmotion,
    options.detectedStressLevel || 0
  );

  // Detect topic absences
  const topicAbsences = detectTopicAbsences(
    humanMemory,
    options.recentTopics || [],
    options.sessionCount || 0
  );

  // Get temporal context
  const temporalContext = getTemporalContext(humanMemory);

  // Build prompt injection
  const promptInjection = buildPromptInjection(
    allInsights,
    comfortGuidance,
    topicAbsences,
    temporalContext
  );

  return {
    insights: allInsights,
    comfortGuidance,
    topicAbsences,
    promptInjection,
    temporalContext,
  };
}

/**
 * Build formatted prompt injection from all superhuman context
 */
function buildPromptInjection(
  insights: ProactiveInsight[],
  comfortGuidance: ComfortGuidance,
  topicAbsences: TopicAbsenceInsight[],
  temporalContext: TemporalContextResult
): string {
  const sections: string[] = [];

  // High priority insights (dates, etc.)
  const highPriorityInsights = insights.filter((i) => i.priority === 'high');
  if (highPriorityInsights.length > 0) {
    sections.push('[IMPORTANT - Consider mentioning naturally]');
    for (const insight of highPriorityInsights.slice(0, 2)) {
      sections.push(`• ${insight.naturalPhrase}`);
    }
  }

  // Comfort guidance
  if (comfortGuidance.promptInjection) {
    sections.push('');
    sections.push(comfortGuidance.promptInjection);
  }

  // Temporal awareness
  if (temporalContext.promptInjection) {
    sections.push('');
    sections.push(temporalContext.promptInjection);
  }

  // Topic absences (limit to 1 to avoid overwhelming)
  if (topicAbsences.length > 0 && topicAbsences[0].suggestedApproach === 'gentle_check_in') {
    sections.push('');
    sections.push('[POSSIBLE CHECK-IN - Only if natural]');
    sections.push(`• ${topicAbsences[0].naturalPrompt}`);
  }

  // Growth celebrations (subtle)
  const growthInsights = insights.filter((i) => i.type === 'growth_celebration');
  if (growthInsights.length > 0) {
    sections.push('');
    sections.push('[GROWTH OBSERVED - Reference if opportunity arises]');
    sections.push(`• ${growthInsights[0].naturalPhrase}`);
  }

  return sections.join('\n');
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Date awareness
  checkUpcomingDates,

  // Comfort patterns
  getComfortGuidance,

  // Growth celebration
  findCelebratableGrowth,

  // Topic absence
  detectTopicAbsences,

  // Inside jokes
  findSurfaceableJokes,

  // Temporal
  getTemporalContext,

  // Voice patterns
  recordVoicePattern,
  analyzeVoicePatterns,

  // Main context builder
  buildSuperhumanContext,

  // Delivery tracking
  markInsightDelivered,
  wasRecentlyDelivered,
  cleanupDeliveryRecords,
};
