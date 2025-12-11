/**
 * Predictive Insights Service
 *
 * > "Better than human means seeing what's coming before they do."
 *
 * This service provides superhuman predictive capabilities:
 *
 * 1. ENERGY PREDICTION - Optimal times for challenging tasks
 * 2. RELATIONSHIP HEALTH - Sentiment shifts in key relationships
 * 3. GOAL TRAJECTORY - Project completion dates and course corrections
 * 4. BURNOUT PREDICTION - Calendar + patterns = burnout risk score
 * 5. DECISION TIMING - Track when decisions are "ready"
 * 6. SOCIAL CONNECTION - Detect relationship neglect
 * 7. SEASONAL MOOD - Historical pattern detection
 * 8. HABIT DECAY - Early warning on habit frequency decline
 *
 * Philosophy:
 * - Predict to HELP, not to judge
 * - Surface insights at the RIGHT MOMENT
 * - Always frame as support, never surveillance
 *
 * @module PredictiveInsights
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PredictiveInsights' });

// ============================================================================
// RE-EXPORTS
// ============================================================================

export * from './burnout-prediction.js';
export * from './data-collector.js';
export * from './decision-timing.js';
export * from './energy-prediction.js';
export * from './goal-trajectory.js';
export * from './habit-decay.js';
export * from './outreach-integration.js';
export * from './relationship-health.js';
export * from './seasonal-mood.js';
export * from './social-connection.js';
export type * from './types.js';

// ============================================================================
// UNIFIED PREDICTION ENGINE
// ============================================================================

import { predictBurnoutRisk, type BurnoutPrediction } from './burnout-prediction.js';
import { assessDecisionReadiness, type DecisionReadiness } from './decision-timing.js';
import { predictEnergy, type EnergyPrediction } from './energy-prediction.js';
import { projectGoalTrajectory, type GoalTrajectory } from './goal-trajectory.js';
import { detectHabitDecay, type HabitDecayWarning } from './habit-decay.js';
import {
  assessRelationshipHealth,
  type RelationshipHealthAssessment,
} from './relationship-health.js';
import { predictSeasonalMood, type SeasonalMoodPrediction } from './seasonal-mood.js';
import { checkSocialConnections, type SocialConnectionAlert } from './social-connection.js';
import type { InsightPriority, PredictiveInsight } from './types.js';

/**
 * Run all predictive analyses for a user
 * Returns prioritized insights that should be surfaced
 */
export async function runPredictiveAnalysis(userId: string): Promise<PredictiveInsight[]> {
  const insights: PredictiveInsight[] = [];
  const now = new Date();

  log.info({ userId }, '🔮 Running predictive analysis');

  try {
    // Run all predictions in parallel
    const [energy, relationships, goals, burnout, decisions, social, seasonal, habits] =
      await Promise.all([
        predictEnergy(userId).catch((e) => {
          log.warn({ e }, 'Energy prediction failed');
          return null;
        }),
        assessRelationshipHealth(userId).catch((e) => {
          log.warn({ e }, 'Relationship health failed');
          return null;
        }),
        projectGoalTrajectory(userId).catch((e) => {
          log.warn({ e }, 'Goal trajectory failed');
          return null;
        }),
        predictBurnoutRisk(userId).catch((e) => {
          log.warn({ e }, 'Burnout prediction failed');
          return null;
        }),
        assessDecisionReadiness(userId).catch((e) => {
          log.warn({ e }, 'Decision timing failed');
          return null;
        }),
        checkSocialConnections(userId).catch((e) => {
          log.warn({ e }, 'Social connection failed');
          return null;
        }),
        predictSeasonalMood(userId).catch((e) => {
          log.warn({ e }, 'Seasonal mood failed');
          return null;
        }),
        detectHabitDecay(userId).catch((e) => {
          log.warn({ e }, 'Habit decay failed');
          return null;
        }),
      ]);

    // Convert predictions to insights
    if (energy?.shouldSurface) {
      insights.push(energyToInsight(energy, userId, now));
    }

    if (relationships && relationships.length > 0) {
      for (const rel of relationships.filter((r) => r.shouldSurface)) {
        insights.push(relationshipToInsight(rel, userId, now));
      }
    }

    if (goals && goals.length > 0) {
      for (const goal of goals.filter((g) => g.shouldSurface)) {
        insights.push(goalToInsight(goal, userId, now));
      }
    }

    if (burnout?.shouldSurface) {
      insights.push(burnoutToInsight(burnout, userId, now));
    }

    if (decisions && decisions.length > 0) {
      for (const decision of decisions.filter((d) => d.shouldSurface)) {
        insights.push(decisionToInsight(decision, userId, now));
      }
    }

    if (social && social.length > 0) {
      for (const alert of social.filter((s) => s.shouldSurface)) {
        insights.push(socialToInsight(alert, userId, now));
      }
    }

    if (seasonal?.shouldSurface) {
      insights.push(seasonalToInsight(seasonal, userId, now));
    }

    if (habits && habits.length > 0) {
      for (const habit of habits.filter((h) => h.shouldSurface)) {
        insights.push(habitToInsight(habit, userId, now));
      }
    }

    // Sort by priority
    insights.sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));

    log.info(
      { userId, insightCount: insights.length, types: insights.map((i) => i.type) },
      '🔮 Predictive analysis complete'
    );

    return insights;
  } catch (error) {
    log.error({ error, userId }, 'Predictive analysis failed');
    return [];
  }
}

// ============================================================================
// INSIGHT CONVERTERS
// ============================================================================

function energyToInsight(energy: EnergyPrediction, userId: string, now: Date): PredictiveInsight {
  return {
    id: `energy_${userId}_${now.getTime()}`,
    type: 'energy_prediction',
    userId,
    title: 'Optimal Energy Window',
    message: energy.message,
    suggestion: energy.suggestion,
    priority: energy.confidence > 0.8 ? 'high' : 'medium',
    confidence: energy.confidence,
    validUntil: energy.windowEnd,
    createdAt: now,
    metadata: {
      predictedLevel: energy.predictedLevel,
      windowStart: energy.windowStart,
      windowEnd: energy.windowEnd,
      factors: energy.factors,
    },
  };
}

function relationshipToInsight(
  rel: RelationshipHealthAssessment,
  userId: string,
  now: Date
): PredictiveInsight {
  return {
    id: `relationship_${userId}_${rel.relationshipId}_${now.getTime()}`,
    type: 'relationship_health',
    userId,
    title: `Relationship Check: ${rel.personName}`,
    message: rel.message,
    suggestion: rel.suggestion,
    priority: rel.severity === 'concern' ? 'high' : 'medium',
    confidence: rel.confidence,
    createdAt: now,
    metadata: {
      personName: rel.personName,
      sentimentTrend: rel.sentimentTrend,
      languageShift: rel.languageShift,
      daysSincePositiveMention: rel.daysSincePositiveMention,
    },
  };
}

function goalToInsight(goal: GoalTrajectory, userId: string, now: Date): PredictiveInsight {
  return {
    id: `goal_${userId}_${goal.goalId}_${now.getTime()}`,
    type: 'goal_trajectory',
    userId,
    title: `Goal Update: ${goal.goalName}`,
    message: goal.message,
    suggestion: goal.suggestion,
    priority: goal.onTrack ? 'low' : 'high',
    confidence: goal.confidence,
    validUntil: goal.projectedCompletion,
    createdAt: now,
    metadata: {
      goalName: goal.goalName,
      currentProgress: goal.currentProgress,
      targetProgress: goal.targetProgress,
      projectedCompletion: goal.projectedCompletion,
      originalDeadline: goal.originalDeadline,
      daysOff: goal.daysOff,
      courseCorrection: goal.courseCorrection,
    },
  };
}

function burnoutToInsight(
  burnout: BurnoutPrediction,
  userId: string,
  now: Date
): PredictiveInsight {
  return {
    id: `burnout_${userId}_${now.getTime()}`,
    type: 'burnout_prediction',
    userId,
    title: 'Burnout Risk Alert',
    message: burnout.message,
    suggestion: burnout.suggestion,
    priority:
      burnout.riskLevel === 'high'
        ? 'urgent'
        : burnout.riskLevel === 'moderate'
          ? 'high'
          : 'medium',
    confidence: burnout.confidence,
    validUntil: burnout.riskPeakDate,
    createdAt: now,
    metadata: {
      riskLevel: burnout.riskLevel,
      riskScore: burnout.riskScore,
      factors: burnout.factors,
      riskPeakDate: burnout.riskPeakDate,
      recoveryActions: burnout.recoveryActions,
    },
  };
}

function decisionToInsight(
  decision: DecisionReadiness,
  userId: string,
  now: Date
): PredictiveInsight {
  return {
    id: `decision_${userId}_${decision.decisionId}_${now.getTime()}`,
    type: 'decision_timing',
    userId,
    title: `Decision Ready: ${decision.topic}`,
    message: decision.message,
    suggestion: decision.suggestion,
    priority: decision.isReady ? 'high' : 'low',
    confidence: decision.confidence,
    createdAt: now,
    metadata: {
      topic: decision.topic,
      incubationDays: decision.incubationDays,
      mentionCount: decision.mentionCount,
      sentimentStability: decision.sentimentStability,
      historicalPattern: decision.historicalPattern,
    },
  };
}

function socialToInsight(
  alert: SocialConnectionAlert,
  userId: string,
  now: Date
): PredictiveInsight {
  return {
    id: `social_${userId}_${alert.personId}_${now.getTime()}`,
    type: 'social_connection',
    userId,
    title: `Missing Connection: ${alert.personName}`,
    message: alert.message,
    suggestion: alert.suggestion,
    priority: alert.severity === 'significant' ? 'high' : 'medium',
    confidence: alert.confidence,
    createdAt: now,
    metadata: {
      personName: alert.personName,
      daysSinceLastMention: alert.daysSinceLastMention,
      usualFrequency: alert.usualFrequency,
      relationshipType: alert.relationshipType,
    },
  };
}

function seasonalToInsight(
  seasonal: SeasonalMoodPrediction,
  userId: string,
  now: Date
): PredictiveInsight {
  return {
    id: `seasonal_${userId}_${now.getTime()}`,
    type: 'seasonal_mood',
    userId,
    title: 'Seasonal Pattern Ahead',
    message: seasonal.message,
    suggestion: seasonal.suggestion,
    priority: seasonal.severity === 'significant' ? 'high' : 'medium',
    confidence: seasonal.confidence,
    validUntil: seasonal.periodEnd,
    createdAt: now,
    metadata: {
      period: seasonal.period,
      historicalPattern: seasonal.historicalPattern,
      predictedMood: seasonal.predictedMood,
      supportStrategies: seasonal.supportStrategies,
    },
  };
}

function habitToInsight(habit: HabitDecayWarning, userId: string, now: Date): PredictiveInsight {
  return {
    id: `habit_${userId}_${habit.habitId}_${now.getTime()}`,
    type: 'habit_decay',
    userId,
    title: `Habit Slip: ${habit.habitName}`,
    message: habit.message,
    suggestion: habit.suggestion,
    priority: habit.decayRate > 0.5 ? 'high' : 'medium',
    confidence: habit.confidence,
    createdAt: now,
    metadata: {
      habitName: habit.habitName,
      currentFrequency: habit.currentFrequency,
      previousFrequency: habit.previousFrequency,
      decayRate: habit.decayRate,
      daysUntilAbandonment: habit.daysUntilAbandonment,
      interventions: habit.interventions,
    },
  };
}

function priorityScore(priority: InsightPriority): number {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  runPredictiveAnalysis,
};
