/**
 * Proactive coaching trigger detection for Peter's research insights.
 *
 * Cross-Domain Integration:
 * - CEO Coaching: Surfaces pending decisions for Peter's analytical support
 *
 * @module intelligence/context-builders/personas/peter-research-insights/opportunities
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  detectProactiveTriggers,
  type ProactiveTrigger,
} from '../../../../tools/domains/proactive/coaching/index.js';
import type { CEODecision } from '../../../../tools/domains/ceo-coaching/types.js';
import type { HabitInsights, ProactiveCoachingInsights } from './types.js';

const log = createLogger({ module: 'context:peter-opportunities' });

// ============================================================================
// CEO COACHING INTEGRATION - Peter surfaces decisions needing analysis
// ============================================================================

// Decision keywords that suggest Peter's analytical help is needed
const ANALYTICAL_DECISION_PATTERNS = [
  /invest/i,
  /budget/i,
  /financial/i,
  /cost/i,
  /roi/i,
  /revenue/i,
  /pricing/i,
  /salary/i,
  /offer/i,
  /contract/i,
  /vendor/i,
  /subscription/i,
  /hire/i,
  /expand/i,
  /market/i,
  /data/i,
  /metrics/i,
  /numbers/i,
];

function isAnalyticalDecision(decision: CEODecision): boolean {
  return ANALYTICAL_DECISION_PATTERNS.some((pattern) =>
    pattern.test(decision.description)
  );
}

function getDaysOld(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Surface CEO decisions that could benefit from Peter's analytical perspective.
 */
export function detectDecisionOpportunities(
  pendingDecisions: CEODecision[] = []
): string[] {
  const opportunities: string[] = [];

  // Filter for analytical decisions
  const analyticalDecisions = pendingDecisions.filter(isAnalyticalDecision);

  // Surface decisions that need data-driven analysis
  for (const decision of analyticalDecisions.slice(0, 3)) {
    const daysOld = getDaysOld(decision.createdAt);
    const urgency = decision.deadline
      ? ` (deadline approaching)`
      : daysOld > 7
        ? ` (${daysOld} days pending)`
        : '';

    opportunities.push(
      `📊 ANALYTICAL DECISION${urgency}: "${decision.description}" - I can help analyze the data behind this`
    );
  }

  // Flag old decisions without progress
  const staleDecisions = pendingDecisions.filter((d) => getDaysOld(d.createdAt) > 14);
  if (staleDecisions.length > 0) {
    opportunities.push(
      `⚠️ ${staleDecisions.length} decision(s) pending 14+ days - analysis paralysis risk`
    );
  }

  return opportunities;
}

// ============================================================================
// PROACTIVE COACHING TRIGGER DETECTION
// ============================================================================

export function detectProactiveCoachingInsights(
  userId: string,
  mayaInsights: HabitInsights,
  pendingDecisions: CEODecision[] = [] // Cross-Domain: CEO coaching decisions
): ProactiveCoachingInsights {
  const priorityInsights: string[] = [];

  // Cross-Domain: Add CEO decision opportunities first (Peter's specialty)
  const decisionOpportunities = detectDecisionOpportunities(pendingDecisions);
  priorityInsights.push(...decisionOpportunities);

  try {
    // Build detection context from Maya's data
    const activeHabits = mayaInsights.currentStreaks.map((s, i) => ({
      id: `habit_${i}`,
      name: s.name,
      currentStreak: s.streak,
      lastCompletion: new Date(), // Would come from actual data
      level: 1,
      successRate: mayaInsights.averageSuccessRate,
    }));

    // Add at-risk habits with broken streaks
    mayaInsights.atRiskHabits.forEach((name, i) => {
      activeHabits.push({
        id: `atrisk_${i}`,
        name,
        currentStreak: 0,
        lastCompletion: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        level: 1,
        successRate: 0.3,
      });
    });

    const detectionContext = {
      userId,
      activeHabits,
      recentMoods: [], // Would come from mood data
      weeklyReflectionsDue: false,
    };

    const triggers = detectProactiveTriggers(detectionContext);

    // Extract priority insights from triggers
    triggers.slice(0, 3).forEach((t) => {
      if (t.priority === 'urgent' || t.priority === 'high') {
        priorityInsights.push(`[${t.type}] ${t.message.opener}`);
      }
    });

    // Add streak-at-risk insights
    const streakRisk = triggers.filter((t) => t.type === 'streak_at_risk');
    if (streakRisk.length > 0) {
      priorityInsights.push(
        `⚠️ ${streakRisk.length} streak(s) at risk of breaking - opportunity for intervention`
      );
    }

    // Add celebration opportunities
    const milestones = triggers.filter((t) => t.type === 'streak_milestone');
    if (milestones.length > 0) {
      priorityInsights.push(
        `🎉 ${milestones.length} streak milestone(s) achieved - celebrate these wins!`
      );
    }

    return { triggers, priorityInsights };
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not detect proactive coaching insights');
    return { triggers: [], priorityInsights: [] };
  }
}
