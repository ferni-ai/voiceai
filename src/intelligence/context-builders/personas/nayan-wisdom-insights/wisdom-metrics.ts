/**
 * Nayan's Wisdom Insights - Computed Wisdom Metrics
 *
 * Computes Nayan's wisdom dashboard metrics:
 * - Life Integration Score (0-100): Harmony across life areas
 * - Meaning Coherence (0-100): Actions aligned with values
 * - Legacy Readiness (0-100): Long-term impact awareness
 * - Inner Peace Index (0-100): Acceptance vs. striving
 * - Growth Trajectory (0-100): Direction of evolution
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/wisdom-metrics
 */

import { getGamificationStore } from '../../../../services/engagement/gamification-store.js';
import type { LifeSynthesis, ValuesAlignment, WisdomMetrics } from './types.js';

// ============================================================================
// COMPUTED WISDOM METRICS
// ============================================================================

export async function computeWisdomMetrics(
  userId: string,
  lifeSynthesis: LifeSynthesis,
  valuesAlignment: ValuesAlignment
): Promise<WisdomMetrics> {
  const metrics: WisdomMetrics = {
    lifeIntegration: 50,
    meaningCoherence: 50,
    legacyReadiness: 30,
    innerPeaceIndex: 50,
    growthTrajectory: 50,
    patterns: [],
  };

  try {
    // Life Integration: Based on compounding areas and growth pattern
    const compoundingBonus = lifeSynthesis.compoundingAreas.length * 15;
    const patternBonus =
      lifeSynthesis.growthPattern === 'integrating'
        ? 30
        : lifeSynthesis.growthPattern === 'transitioning'
          ? 15
          : 0;
    metrics.lifeIntegration = Math.min(100, 30 + compoundingBonus + patternBonus);

    // Meaning Coherence: Based on values alignment
    const coherentCount = valuesAlignment.coherentAreas.length;
    const conflictCount = valuesAlignment.conflictAreas.length;
    metrics.meaningCoherence = Math.min(100, 40 + coherentCount * 20 - conflictCount * 15);

    // Legacy Readiness: Based on time horizon and goal depth
    const horizonBonus =
      lifeSynthesis.timeHorizon === 'long' ? 30 : lifeSynthesis.timeHorizon === 'medium' ? 15 : 0;
    const chapterBonus = ['freedom-seeking', 'creation', 'partnership-building'].includes(
      lifeSynthesis.lifeChapter
    )
      ? 20
      : 0;
    metrics.legacyReadiness = Math.min(100, 20 + horizonBonus + chapterBonus);

    // Inner Peace Index: Based on mood and growth pattern
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const moodLogs = await gamificationStore.getMoodLogs(userId, weekAgo, now);

    if (moodLogs.length > 0) {
      const avgMood = moodLogs.reduce((sum, m) => sum + m.mood, 0) / moodLogs.length;
      const moodBonus = Math.round((avgMood - 5) * 8);
      const patternPenalty = lifeSynthesis.growthPattern === 'striving' ? 15 : 0;
      metrics.innerPeaceIndex = Math.max(
        0,
        Math.min(100, 50 + moodBonus - patternPenalty + conflictCount * -5)
      );
    }

    // Growth Trajectory: Based on compounding and progress
    const hasCompounding = lifeSynthesis.compoundingAreas.length > 0;
    const hasValues = lifeSynthesis.valuesRevealed.length > 0;
    const isGrowing = ['integrating', 'transitioning'].includes(lifeSynthesis.growthPattern);

    metrics.growthTrajectory = 40 + (hasCompounding ? 20 : 0) + (hasValues ? 15 : 0) + (isGrowing ? 15 : 0);

    // Patterns detected
    if (metrics.lifeIntegration > 70) {
      metrics.patterns.push('Life areas working in harmony');
    }
    if (metrics.meaningCoherence < 40) {
      metrics.patterns.push('Values and actions may be misaligned');
    }
    if (metrics.innerPeaceIndex > 70) {
      metrics.patterns.push('Presence and acceptance emerging');
    } else if (metrics.innerPeaceIndex < 30) {
      metrics.patterns.push('Striving may be outpacing being');
    }
    if (metrics.legacyReadiness > 60) {
      metrics.patterns.push('Long-term thinking active');
    }
  } catch {
    // Graceful degradation - return defaults
  }

  return metrics;
}

