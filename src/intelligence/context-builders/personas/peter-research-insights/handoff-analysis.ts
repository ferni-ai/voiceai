/**
 * Handoff context analysis for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/handoff-analysis
 */

import { getHandoffContext } from '../../../../tools/handoff/executor.js';
import type { HandoffBriefing } from './types.js';

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

export function analyzeHandoffContext(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();

  if (!handoffContext) {
    return null;
  }

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'general conversation',
    previousPersonaInsights: [],
    questionsForPeter: [],
    emotionalWeight: 0,
  };

  // Extract topics and generate Peter-specific questions
  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lowerTopic = topic.toLowerCase();

    // Financial topics → Peter's wheelhouse
    if (
      lowerTopic.includes('spend') ||
      lowerTopic.includes('budget') ||
      lowerTopic.includes('money')
    ) {
      briefing.questionsForPeter.push(
        `User was discussing ${topic} - look for patterns in their spending data that connect to this`
      );
    }

    // Habit topics → Cross-domain correlation opportunity
    if (
      lowerTopic.includes('habit') ||
      lowerTopic.includes('routine') ||
      lowerTopic.includes('exercise')
    ) {
      briefing.questionsForPeter.push(
        `Habits topic came up - explore correlation between habit streaks and financial behaviors`
      );
    }

    // Goal topics → Trajectory analysis
    if (
      lowerTopic.includes('goal') ||
      lowerTopic.includes('save') ||
      lowerTopic.includes('target')
    ) {
      briefing.questionsForPeter.push(
        `Goal discussion in progress - run trajectory analysis to show progress patterns`
      );
    }

    // Stress/emotion topics → Behavioral economics lens
    if (
      lowerTopic.includes('stress') ||
      lowerTopic.includes('anxious') ||
      lowerTopic.includes('worried')
    ) {
      briefing.questionsForPeter.push(
        `Emotional topic detected - apply behavioral economics lens. Stress often correlates with spending patterns.`
      );
      briefing.emotionalWeight = 0.7;
    }
  }

  // Capture summary if available
  if (handoffContext.summary) {
    briefing.previousPersonaInsights.push(`Previous persona noted: "${handoffContext.summary}"`);
  }

  // Note emotional state
  if (handoffContext.emotionalState && handoffContext.emotionalState !== 'neutral') {
    briefing.previousPersonaInsights.push(
      `User emotional state: ${handoffContext.emotionalState} - adjust research delivery accordingly`
    );
    briefing.emotionalWeight = Math.max(briefing.emotionalWeight, 0.5);
  }

  // Extract cognitive handoff context if available
  if (handoffContext.cognitiveContext) {
    const cogCtx = handoffContext.cognitiveContext;

    if (cogCtx.potentialBlindSpots?.length > 0) {
      briefing.questionsForPeter.push(
        `Potential blind spots from previous persona: ${cogCtx.potentialBlindSpots.slice(0, 2).join('; ')}`
      );
    }

    if (cogCtx.effectiveApproaches?.length > 0) {
      briefing.previousPersonaInsights.push(
        `Approaches that worked: ${cogCtx.effectiveApproaches.join(', ')}`
      );
    }
  }

  return briefing;
}
