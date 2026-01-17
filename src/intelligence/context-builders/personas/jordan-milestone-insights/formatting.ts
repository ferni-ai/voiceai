/**
 * Jordan Milestone Insights - Formatting
 *
 * Formats the briefing into injection content.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/formatting
 */

import type { JordanInsightBriefing, HandoffBriefing } from './types.js';

// ============================================================================
// FORMAT BRIEFING FOR INJECTION
// ============================================================================

export function formatJordanBriefing(
  briefing: JordanInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[JORDAN'S MILESTONE BRIEFING - Turn ${turnCount}]`);

  // Handoff context first
  if (handoffBriefing) {
    sections.push('\n=== HANDOFF CONTEXT ===');
    sections.push(`Topic: ${handoffBriefing.topic}`);

    const excitementEmoji =
      handoffBriefing.excitementLevel === 'high'
        ? '🎉'
        : handoffBriefing.excitementLevel === 'low'
          ? '💙'
          : '✨';
    sections.push(`Energy: ${excitementEmoji} ${handoffBriefing.excitementLevel}`);

    if (handoffBriefing.planningContext) {
      sections.push(`Planning context: ${handoffBriefing.planningContext}`);
    }
    if (handoffBriefing.actionItems.length > 0) {
      sections.push(`Team handoff notes: ${handoffBriefing.actionItems.join('; ')}`);
    }
    if (handoffBriefing.previousPersonaInsights.length > 0) {
      briefing.peterInsights.financialReadiness.forEach((insight) => sections.push(`• ${insight}`));
    }
    if (handoffBriefing.emotionalWeight > 0.5) {
      sections.push(
        'NOTE: User may be emotionally charged. Start with validation before diving into planning.'
      );
    }
  }

  // COMPUTED PLANNING METRICS
  const { planningMetrics } = briefing;
  sections.push('\n=== YOUR PLANNING DASHBOARD (Real Data) ===');
  sections.push(`• Planning Velocity Index: ${planningMetrics.planningVelocityIndex}/100`);
  sections.push(`• Celebration Readiness: ${planningMetrics.celebrationReadinessScore}/100`);
  sections.push(`• Life Stage Momentum: ${planningMetrics.lifeStageMomentum}/100`);
  sections.push(`• Event Success Predictor: ${planningMetrics.eventSuccessPredictor}/100`);

  // Cross-domain patterns
  if (planningMetrics.patterns.length > 0) {
    sections.push('\n=== CROSS-DOMAIN PATTERNS DETECTED ===');
    planningMetrics.patterns.forEach((pattern) => sections.push(`• ${pattern}`));
  }

  // Goals dashboard
  const { goalsOverview } = briefing;
  sections.push('\n=== GOALS DASHBOARD ===');
  sections.push(`• Active goals: ${goalsOverview.activeGoals}`);
  sections.push(`• Total saved: $${goalsOverview.totalSavedTowardGoals.toLocaleString()}`);
  if (goalsOverview.biggestGoal) {
    sections.push(
      `• Biggest goal: "${goalsOverview.biggestGoal.name}" (${goalsOverview.biggestGoal.progress}% complete)`
    );
  }
  if (goalsOverview.milestoneDates.length > 0) {
    const upcoming = goalsOverview.milestoneDates
      .slice(0, 3)
      .map((m) => `${m.name} (${m.daysAway}d)`)
      .join(', ');
    sections.push(`• Upcoming: ${upcoming}`);
  }

  // Life stage context
  if (briefing.lifeStageContext.currentStage !== 'active-planning') {
    sections.push('\n=== LIFE STAGE CONTEXT ===');
    sections.push(`🌟 Current stage: ${briefing.lifeStageContext.currentStage}`);
    briefing.lifeStageContext.stageSpecificAdvice
      .slice(0, 2)
      .forEach((advice) => sections.push(`• ${advice}`));
    briefing.lifeStageContext.transitionSignals.forEach((signal) =>
      sections.push(`• 🔄 ${signal}`)
    );
  }

  // FROM PETER (Financial Context)
  if (briefing.peterInsights.financialReadiness.length > 0) {
    sections.push('\n=== FROM PETER (Financial Readiness) ===');
    sections.push(`• Budget health: ${briefing.peterInsights.budgetHealth}`);
    sections.push(`• Savings velocity: ${briefing.peterInsights.savingsVelocity}`);
    if (briefing.peterInsights.monthsToGoalCompletion) {
      sections.push(
        `• Months to goal completion: ~${briefing.peterInsights.monthsToGoalCompletion}`
      );
    }
    briefing.peterInsights.financialReadiness
      .slice(0, 3)
      .forEach((insight) => sections.push(`• ${insight}`));
  }

  // FROM MAYA (Habit Support)
  if (briefing.mayaInsights.activeHabits > 0) {
    sections.push('\n=== FROM MAYA (Habit Momentum) ===');
    sections.push(`• Active habits: ${briefing.mayaInsights.activeHabits}`);
    sections.push(`• Momentum score: ${briefing.mayaInsights.momentumScore}/100`);
    if (briefing.mayaInsights.keystoneHabits.length > 0) {
      sections.push(`• Keystone habits: ${briefing.mayaInsights.keystoneHabits.join(', ')}`);
    }
    if (briefing.mayaInsights.currentStreaks.length > 0) {
      const streaks = briefing.mayaInsights.currentStreaks
        .slice(0, 3)
        .map((s) => `${s.name} (${s.streak}d)`)
        .join(', ');
      sections.push(`• Active streaks: ${streaks}`);
    }
    if (briefing.mayaInsights.planningRelatedHabits.length > 0) {
      sections.push(`• Planning habits: ${briefing.mayaInsights.planningRelatedHabits.join(', ')}`);
    }
  }

  // MOOD/ENERGY STATE
  if (briefing.moodPatterns.lastMood || briefing.moodPatterns.recentMoodTrend !== 'unknown') {
    sections.push('\n=== EMOTIONAL STATE ===');
    if (briefing.moodPatterns.lastMood) {
      sections.push(
        `• Last mood: ${briefing.moodPatterns.lastMood.mood} mood, ${briefing.moodPatterns.lastMood.energy} energy`
      );
    }
    sections.push(`• Mood trend: ${briefing.moodPatterns.recentMoodTrend}`);
    sections.push(`• Celebration readiness: ${briefing.moodPatterns.celebrationReadiness}`);
  }

  // SEASONAL CONTEXT
  if (briefing.seasonalContext.currentSeason) {
    sections.push('\n=== SEASONAL AWARENESS ===');
    sections.push(`• Season: ${briefing.seasonalContext.currentSeason}`);
    briefing.seasonalContext.seasonalOpportunities
      .slice(0, 2)
      .forEach((opp) => sections.push(`• ${opp}`));
    if (briefing.seasonalContext.upcomingDates.length > 0) {
      const dates = briefing.seasonalContext.upcomingDates
        .slice(0, 3)
        .map((d) => `${d.name} (${d.daysAway}d)`)
        .join(', ');
      sections.push(`• Upcoming: ${dates}`);
    }
  }

  // Better Than Human: Milestone calendar sync
  if (briefing.milestoneCalendarSync) {
    sections.push('\n=== CALENDAR SYNC (from Alex) ===');
    sections.push(briefing.milestoneCalendarSync);
  }

  // Cross-Persona: Jordan ↔ Alex coordination
  if (briefing.alexCoordinationContext) {
    sections.push('\n=== TEAM COORDINATION ===');
    sections.push(briefing.alexCoordinationContext);
  }

  // CELEBRATION OPPORTUNITIES
  if (briefing.celebrationOpportunities.length > 0) {
    sections.push('\n=== 🎉 CELEBRATION OPPORTUNITIES ===');
    briefing.celebrationOpportunities.slice(0, 4).forEach((opp) => sections.push(`• ${opp}`));
  }

  // PROACTIVE DISCOVERIES
  if (briefing.proactiveDiscoveries.length > 0) {
    sections.push('\n=== PROACTIVE DISCOVERIES ===');
    briefing.proactiveDiscoveries.slice(0, 4).forEach((disc) => sections.push(`• ${disc}`));
  }

  // TIMELINE ALERTS
  if (briefing.timelineAlerts.length > 0) {
    sections.push('\n=== ⚠️ TIMELINE ALERTS ===');
    briefing.timelineAlerts.slice(0, 3).forEach((alert) => sections.push(`• ${alert}`));
  }

  return sections;
}
