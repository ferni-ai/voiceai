/**
 * Proactive trigger detection for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/triggers
 */

import type {
  HabitHealthSummary,
  MoodIntelligence,
  CoachingMetrics,
  ProactiveTrigger,
} from './types.js';

// ============================================================================
// PROACTIVE COACHING TRIGGERS
// ============================================================================

export function detectProactiveTriggers(
  habitHealth: HabitHealthSummary,
  metrics: CoachingMetrics,
  moodIntelligence: MoodIntelligence
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  // Celebration triggers
  if (habitHealth.longestStreak && habitHealth.longestStreak.days >= 7) {
    triggers.push({
      type: 'celebration',
      message: `🎉 "${habitHealth.longestStreak.name}" hit ${habitHealth.longestStreak.days} days! This is huge.`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  if (habitHealth.totalCompletions > 0 && habitHealth.totalCompletions % 50 === 0) {
    triggers.push({
      type: 'celebration',
      message: `🏆 ${habitHealth.totalCompletions} total completions! Momentum is building.`,
      priority: 'medium',
      timing: 'immediate',
    });
  }

  // Support triggers
  if (habitHealth.atRiskCount > 0) {
    triggers.push({
      type: 'support',
      message: `💚 ${habitHealth.atRiskCount} habit(s) need gentle attention: ${habitHealth.recentSetbacks.join(', ')}`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  if (moodIntelligence.recentMoodTrend === 'declining') {
    triggers.push({
      type: 'support',
      message: 'Mood has been dipping - focus on self-care habits before new challenges',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Challenge triggers
  if (metrics.consistencyIndex > 70 && !habitHealth.keystoneActive) {
    triggers.push({
      type: 'challenge',
      message: 'Consistency is strong - ready to identify a keystone habit',
      priority: 'medium',
      timing: 'when_relevant',
    });
  }

  if (metrics.momentumScore > 70 && habitHealth.activeHabits < 5) {
    triggers.push({
      type: 'challenge',
      message: 'High momentum - consider adding a new tiny habit',
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  // Insight triggers
  if (metrics.cascadePotential > 60) {
    triggers.push({
      type: 'insight',
      message: 'Habits are starting to cascade - help them see the connections',
      priority: 'medium',
      timing: 'when_relevant',
    });
  }

  if (moodIntelligence.optimalCoachingTime) {
    triggers.push({
      type: 'insight',
      message: `Best energy is in the ${moodIntelligence.optimalCoachingTime} - schedule important habits then`,
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  // Connection triggers
  if (habitHealth.habitStacks.length > 0) {
    triggers.push({
      type: 'connection',
      message: 'Habit stacks are active - reinforce the chain',
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  return triggers;
}
