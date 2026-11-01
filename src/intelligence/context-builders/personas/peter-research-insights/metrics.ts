/**
 * Cross-domain patterns for Peter's research insights, each read off the
 * member's own data. No scores, no clock-of-day lore, no framework templates:
 * those printed as facts about every member, data or not (#3044).
 *
 * @module intelligence/context-builders/personas/peter-research-insights/metrics
 */

import type { HabitInsights, MoodInsights } from './types.js';

/** Patterns the member's habits, moods and spending actually show; empty when none do. */
export function detectCrossDomainPatterns(
  mayaInsights: HabitInsights,
  moodPatterns: MoodInsights,
  spendingInsights: string[]
): string[] {
  const patterns: string[] = [];
  const hasMoodLogs = moodPatterns.lastMood !== null;
  const hasOverBudget = spendingInsights.some((i) => i.includes('over budget'));

  if (mayaInsights.atRiskHabits.length > 0 && moodPatterns.recentMoodTrend === 'declining') {
    patterns.push('Habit struggles + declining mood = likely stress cascade');
  }
  if (mayaInsights.keystoneHabits.length > 0 && mayaInsights.averageSuccessRate > 0.7) {
    patterns.push('Active keystone habit = strong foundation for other changes');
  }
  if (hasMoodLogs && moodPatterns.averageEnergy < 2.5 && hasOverBudget) {
    patterns.push('Low energy + overspending = possible emotional spending pattern');
  }
  if (mayaInsights.currentStreaks.length >= 3) {
    patterns.push(
      `Multiple active streaks (${mayaInsights.currentStreaks.length}) = momentum building`
    );
  }

  return patterns;
}
