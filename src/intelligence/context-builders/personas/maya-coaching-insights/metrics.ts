/**
 * Computed coaching metrics for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/metrics
 */

import type {
  HabitHealthSummary,
  MoodIntelligence,
  CoachingMetrics,
  FourTendency,
} from './types.js';

// ============================================================================
// COMPUTED COACHING METRICS
// ============================================================================

export function computeCoachingMetrics(
  habitHealth: HabitHealthSummary,
  moodIntelligence: MoodIntelligence
): CoachingMetrics {
  const metrics: CoachingMetrics = {
    consistencyIndex: 0,
    cascadePotential: 0,
    recoverySpeed: 0,
    momentumScore: 0,
    keystonePower: 0,
    patterns: [],
  };

  if (habitHealth.activeHabits === 0) {
    metrics.patterns.push('No active habits - fresh start opportunity');
    return metrics;
  }

  // Consistency Index: Based on success rate and streak maintenance
  const successWeight = habitHealth.averageSuccessRate * 60;
  const streakRatio =
    habitHealth.activeHabits > 0 ? (habitHealth.totalStreaks / habitHealth.activeHabits) * 40 : 0;
  metrics.consistencyIndex = Math.round(successWeight + streakRatio);

  // Cascade Potential: Based on keystone habits and habit stacks
  const keystoneBonus = habitHealth.keystoneActive ? 40 : 0;
  const stackBonus = Math.min(habitHealth.habitStacks.length * 15, 30);
  const categoryDiversity = Math.min(Object.keys(habitHealth.habitCategories).length * 10, 30);
  metrics.cascadePotential = Math.round(keystoneBonus + stackBonus + categoryDiversity);

  // Recovery Speed: Based on at-risk ratio and past recovery patterns
  const atRiskRatio =
    habitHealth.activeHabits > 0 ? 1 - habitHealth.atRiskCount / habitHealth.activeHabits : 1;
  const reflectionBonus = habitHealth.weeklyReflectionSummary ? 20 : 0;
  metrics.recoverySpeed = Math.round(atRiskRatio * 80 + reflectionBonus);

  // Momentum Score: Based on trends and energy
  const trendBonus =
    moodIntelligence.recentMoodTrend === 'improving'
      ? 30
      : moodIntelligence.recentMoodTrend === 'stable'
        ? 15
        : 0;
  const energyBonus = Math.round(moodIntelligence.averageEnergy * 10);
  const completionBonus = Math.min(habitHealth.totalCompletions / 10, 30);
  metrics.momentumScore = Math.round(trendBonus + energyBonus + completionBonus);

  // Keystone Power: Based on keystone habit performance
  if (habitHealth.keystoneHabits.length > 0) {
    const keystoneCount = habitHealth.keystoneHabits.length;
    const keystoneActiveBonus = habitHealth.keystoneActive ? 50 : 0;
    metrics.keystonePower = Math.round(keystoneCount * 20 + keystoneActiveBonus);
  }

  // Detect patterns
  if (metrics.consistencyIndex > 70) {
    metrics.patterns.push('Strong consistency - ready for habit stacking');
  } else if (metrics.consistencyIndex < 40) {
    metrics.patterns.push('Consistency needs work - focus on one tiny habit');
  }

  if (metrics.cascadePotential > 60) {
    metrics.patterns.push('High cascade potential - habits are interconnecting');
  }

  if (metrics.recoverySpeed < 50 && habitHealth.atRiskCount > 0) {
    metrics.patterns.push('Recovery support needed - self-compassion first');
  }

  if (metrics.momentumScore > 70) {
    metrics.patterns.push('Strong momentum - capitalize on this energy');
  } else if (metrics.momentumScore < 30) {
    metrics.patterns.push('Low momentum - need a quick win to build energy');
  }

  if (metrics.keystonePower > 70) {
    metrics.patterns.push('Keystone habits are driving growth');
  } else if (habitHealth.activeHabits > 3 && metrics.keystonePower < 30) {
    metrics.patterns.push('Missing keystone - too many habits without anchor');
  }

  return metrics;
}

// ============================================================================
// FOUR TENDENCIES DETECTION
// ============================================================================

export function detectFourTendency(habitHealth: HabitHealthSummary): FourTendency | null {
  // This is a simple heuristic - would ideally come from user profile
  // Based on habit patterns, we can make educated guesses

  if (habitHealth.activeHabits === 0) return null;

  const hasExternalAccountability = habitHealth.habitStacks.length > 0;
  const hasInternalConsistency = habitHealth.averageSuccessRate > 0.7;
  const hasStructure = habitHealth.keystoneActive;

  if (hasInternalConsistency && hasStructure) {
    return 'upholder'; // Meets inner and outer expectations
  }

  if (!hasInternalConsistency && hasExternalAccountability) {
    return 'obliger'; // Needs external accountability
  }

  if (hasInternalConsistency && !hasExternalAccountability) {
    return 'questioner'; // Internal reasoning-driven
  }

  if (!hasInternalConsistency && !hasExternalAccountability) {
    return 'rebel'; // Resists all expectations
  }

  return null;
}
