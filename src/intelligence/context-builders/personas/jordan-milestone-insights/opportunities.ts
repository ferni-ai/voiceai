/**
 * Jordan Milestone Insights - Opportunities & Discoveries
 *
 * Celebration opportunities, proactive discoveries, and timeline alerts.
 *
 * Cross-Domain Integration:
 * - CEO coaching wins are surfaced as celebration opportunities
 * - Jordan sees professional achievements alongside personal milestones
 *
 * @module intelligence/context-builders/jordan-milestone-insights/opportunities
 */

import type {
  GoalsOverview,
  PeterFinancialInsights,
  MemoryInsights,
  PlanningMetrics,
  JordanInsightBriefing,
} from './types.js';
import type { CEOWin } from '../../../../tools/domains/ceo-coaching/types.js';

// ============================================================================
// CEO COACHING WIN PATTERNS
// ============================================================================

// Significant win keywords that warrant celebration
const SIGNIFICANT_WIN_PATTERNS = [
  /shipped/i,
  /launched/i,
  /closed/i,
  /signed/i,
  /promoted/i,
  /hired/i,
  /funded/i,
  /raised/i,
  /won/i,
  /completed/i,
  /delivered/i,
  /achieved/i,
  /million/i,
  /partnership/i,
  /revenue/i,
];

/**
 * Get days since a date string (YYYY-MM-DD format)
 * Uses string comparison to avoid timezone issues
 */
function getDaysAgo(dateStr: string): number {
  // Parse date parts directly to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const inputDate = new Date(year, month - 1, day); // Month is 0-indexed
  inputDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - inputDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if a win is significant based on keyword patterns
 */
function isSignificantWin(win: CEOWin): boolean {
  return SIGNIFICANT_WIN_PATTERNS.some((pattern) => pattern.test(win.text));
}

// ============================================================================
// CELEBRATION OPPORTUNITY DETECTION
// ============================================================================

export function detectCelebrationOpportunities(
  goalsOverview: GoalsOverview,
  planningMetrics: PlanningMetrics,
  memoryInsights: MemoryInsights,
  ceoWins: CEOWin[] = []
): string[] {
  const opportunities: string[] = [];

  // CEO Coaching wins (Cross-Domain Integration)
  // Prioritize recent significant wins for celebration
  const recentSignificantWins = ceoWins
    .filter((win) => getDaysAgo(win.date) <= 7 && isSignificantWin(win))
    .slice(0, 3);

  for (const win of recentSignificantWins) {
    const daysAgo = getDaysAgo(win.date);
    const timing = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
    opportunities.push(`🚀 PROFESSIONAL WIN (${timing}): "${win.text}" - this deserves celebration!`);
  }

  // Also surface any wins from today (regardless of significance)
  const todayWins = ceoWins
    .filter((win) => getDaysAgo(win.date) === 0 && !recentSignificantWins.includes(win))
    .slice(0, 2);

  for (const win of todayWins) {
    opportunities.push(`⭐ Fresh win today: "${win.text}" - momentum builder!`);
  }

  // Near completion celebrations
  for (const goal of goalsOverview.nearingCompletion) {
    opportunities.push(`🎯 ${goal} - SO CLOSE! Finish line energy!`);
  }

  // Recently achieved
  for (const goal of goalsOverview.recentlyAchieved) {
    opportunities.push(`🏆 ${goal} ACHIEVED! This NEEDS a celebration moment!`);
  }

  // Savings milestone
  if (goalsOverview.totalSavedTowardGoals >= 1000) {
    const formatted = goalsOverview.totalSavedTowardGoals.toLocaleString();
    opportunities.push(`💰 $${formatted} total saved toward goals - that's REAL progress!`);
  }

  // Multiple active goals
  if (goalsOverview.activeGoals >= 3) {
    opportunities.push(
      `📋 ${goalsOverview.activeGoals} active goals - building their life portfolio!`
    );
  }

  // Upcoming milestone dates
  for (const milestone of goalsOverview.milestoneDates.slice(0, 3)) {
    if (milestone.daysAway <= 30) {
      opportunities.push(
        `📅 "${milestone.name}" deadline in ${milestone.daysAway} days - countdown mode!`
      );
    }
  }

  // Planning metrics celebration
  if (planningMetrics.eventSuccessPredictor >= 80) {
    opportunities.push('🌟 Event Success Predictor at 80%+ - this person is READY to plan big!');
  }

  // Memory-based opportunities
  if (memoryInsights.totalMemories > 30) {
    opportunities.push('📚 Deep relationship - can celebrate their journey with specific memories');
  }

  return opportunities;
}

// ============================================================================
// PROACTIVE DISCOVERIES
// ============================================================================

export function generateProactiveDiscoveries(
  briefing: Omit<JordanInsightBriefing, 'proactiveDiscoveries'>
): string[] {
  const discoveries: string[] = [];

  // Goal-based discoveries
  if (briefing.goalsOverview.nearingCompletion.length > 0) {
    discoveries.push(
      `🎯 Goals nearing completion: ${briefing.goalsOverview.nearingCompletion.join(', ')} - celebrate progress!`
    );
  }

  // Financial readiness discoveries
  if (briefing.peterInsights.budgetHealth === 'excellent') {
    discoveries.push(
      '💪 Financial runway is excellent - good time to dream bigger on milestone planning!'
    );
  }

  // Habit momentum discoveries
  if (briefing.mayaInsights.keystoneHabits.length > 0) {
    discoveries.push(
      `🔑 Keystone habit "${briefing.mayaInsights.keystoneHabits[0]}" is driving momentum - connect it to milestone progress`
    );
  }

  // Mood-based discoveries
  if (briefing.moodPatterns.celebrationReadiness === 'high') {
    discoveries.push('🎉 Emotional readiness is HIGH - perfect time for celebration planning!');
  } else if (briefing.moodPatterns.recentMoodTrend === 'declining') {
    discoveries.push('💙 Mood trend declining - approach with extra care, honor where they are');
  }

  // Memory-based discoveries
  if (briefing.memoryInsights.milestoneMentions.length > 0) {
    discoveries.push(
      `📝 Past milestone discussions: ${briefing.memoryInsights.milestoneMentions[0]} - connect to current planning`
    );
  }

  // Planning metrics discoveries
  for (const pattern of briefing.planningMetrics.patterns.slice(0, 2)) {
    discoveries.push(pattern);
  }

  // Life stage discoveries
  if (briefing.lifeStageContext.transitionSignals.length > 0) {
    discoveries.push(`🔄 ${briefing.lifeStageContext.transitionSignals[0]}`);
  }

  // Seasonal discoveries
  if (briefing.seasonalContext.seasonalOpportunities.length > 0) {
    discoveries.push(briefing.seasonalContext.seasonalOpportunities[0]);
  }

  // Timeline alerts as discoveries
  for (const alert of briefing.timelineAlerts.slice(0, 2)) {
    discoveries.push(alert);
  }

  return discoveries;
}

// ============================================================================
// TIMELINE ALERTS
// ============================================================================

export function generateTimelineAlerts(
  goalsOverview: GoalsOverview,
  peterInsights: PeterFinancialInsights
): string[] {
  const alerts: string[] = [];

  // At-risk goals
  for (const goal of goalsOverview.atRisk) {
    alerts.push(`⚠️ "${goal}" is behind schedule - might need timeline adjustment`);
  }

  // Financial constraints affecting timeline
  if (peterInsights.budgetHealth === 'stressed') {
    alerts.push('💸 Budget stress may impact milestone timelines - plan for flexibility');
  }

  // No current goals
  if (goalsOverview.activeGoals === 0) {
    alerts.push("📝 No active goals yet - what's the next chapter they're dreaming about?");
  }

  // Upcoming deadlines
  for (const milestone of goalsOverview.milestoneDates) {
    if (milestone.daysAway <= 14) {
      alerts.push(`🚨 "${milestone.name}" deadline in ${milestone.daysAway} days - crunch time!`);
    }
  }

  return alerts;
}
