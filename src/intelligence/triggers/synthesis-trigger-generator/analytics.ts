/**
 * Synthesis Trigger Analytics
 *
 * Tracks trigger usage patterns for optimization.
 *
 * @module synthesis-trigger-generator/analytics
 */

import type { SynthesisTrigger } from '../life-context-snapshot.js';
import type { SynthesisAnalytics, AnalyticsState } from './types.js';

/**
 * In-memory analytics state
 */
let analyticsData: AnalyticsState = {
  triggerCounts: {},
  totalGenerated: 0,
  categoryBreakdown: {},
  priorityBreakdown: {},
  personaBreakdown: {},
  confidenceSum: 0,
};

/**
 * Record triggers for analytics
 */
export function recordSynthesisTriggers(triggers: SynthesisTrigger[]): void {
  for (const trigger of triggers) {
    analyticsData.totalGenerated++;
    analyticsData.triggerCounts[trigger.id] = (analyticsData.triggerCounts[trigger.id] || 0) + 1;
    analyticsData.categoryBreakdown[trigger.category] =
      (analyticsData.categoryBreakdown[trigger.category] || 0) + 1;
    analyticsData.priorityBreakdown[trigger.priority] =
      (analyticsData.priorityBreakdown[trigger.priority] || 0) + 1;
    analyticsData.personaBreakdown[trigger.recommendedPersona] =
      (analyticsData.personaBreakdown[trigger.recommendedPersona] || 0) + 1;
    analyticsData.confidenceSum += trigger.confidence;
  }
}

/**
 * Get synthesis analytics
 */
export function getSynthesisAnalytics(): SynthesisAnalytics {
  const mostCommonTriggers = Object.entries(analyticsData.triggerCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalTriggersGenerated: analyticsData.totalGenerated,
    byCategory: analyticsData.categoryBreakdown as Record<SynthesisTrigger['category'], number>,
    byPriority: analyticsData.priorityBreakdown as Record<SynthesisTrigger['priority'], number>,
    byPersona: analyticsData.personaBreakdown,
    averageConfidence:
      analyticsData.totalGenerated > 0
        ? analyticsData.confidenceSum / analyticsData.totalGenerated
        : 0,
    mostCommonTriggers,
  };
}

/**
 * Reset analytics (for testing)
 */
export function resetSynthesisAnalytics(): void {
  analyticsData = {
    triggerCounts: {},
    totalGenerated: 0,
    categoryBreakdown: {},
    priorityBreakdown: {},
    personaBreakdown: {},
    confidenceSum: 0,
  };
}
