/**
 * Daily Proactive Insights Engine
 *
 * Generates personalized daily insights for each user.
 * Run via Cloud Scheduler to populate insights before users log in.
 *
 * @module tools/domains/research/proactive-engine/daily-insights
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { UserDataService } from '../user-data/index.js';
import { BigBrain } from '../global-intelligence/big-brain.js';
import { PeerBenchmarks } from '../global-intelligence/peer-benchmarks.js';
import { getQuantFirestore } from '../quant-firestore.js';
import { getCompanyFundamentals, getEconomicIndicator } from '../external-apis.js';
import type { QuantInsight } from '../quant-firestore.js';
import type { FinancialGoal, InvestmentThesis } from '../user-data/types.js';

const log = getLogger();

// ============================================================================
// INSIGHT TYPES
// ============================================================================

export type InsightType =
  | 'goal_milestone'
  | 'goal_on_track'
  | 'goal_off_track'
  | 'thesis_check'
  | 'behavioral_pattern'
  | 'peer_update'
  | 'market_opportunity'
  | 'learning_suggestion'
  | 'anniversary'
  | 'economic_alert'
  | 'portfolio_rebalance'
  | 'life_event_followup';

export interface DailyInsight {
  id: string;
  userId: string;
  type: InsightType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  details?: string;
  actionable: boolean;
  action?: {
    type: string;
    parameters: Record<string, unknown>;
  };
  expiresAt?: Date;
  generatedAt: Date;
  delivered: boolean;
  deliveredAt?: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
}

// ============================================================================
// INSIGHT GENERATORS
// ============================================================================

/**
 * Generate goal-related insights
 */
async function generateGoalInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];
  const goals = await UserDataService.loadFinancialGoals(userId);

  for (const goal of goals) {
    // Check for milestone approach
    const nextMilestone = goal.milestones.find(
      (m) => !m.celebratedAt && m.percentage > goal.progress.percentage
    );

    if (nextMilestone && goal.progress.percentage >= nextMilestone.percentage - 5) {
      insights.push({
        id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        type: 'goal_milestone',
        priority: 'high',
        title: `Almost at ${nextMilestone.percentage}%! 🎯`,
        message: `You're just ${(nextMilestone.percentage - goal.progress.percentage).toFixed(1)}% away from the ${nextMilestone.percentage}% milestone on "${goal.name}"!`,
        actionable: false,
        generatedAt: new Date(),
        delivered: false,
        acknowledged: false,
      });
    }

    // Check if off track
    if (goal.target.date && !goal.progress.onTrack) {
      const daysRemaining = Math.ceil(
        (goal.target.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (daysRemaining > 0) {
        const remainingAmount = goal.target.amount - goal.current.amount;
        const monthlyNeeded = remainingAmount / (daysRemaining / 30);

        insights.push({
          id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          type: 'goal_off_track',
          priority: 'medium',
          title: `Let's catch up on "${goal.name}"`,
          message: `You need $${monthlyNeeded.toFixed(0)}/month to hit your ${goal.target.date.toLocaleDateString()} target. Want to review options?`,
          actionable: true,
          action: {
            type: 'review_goal',
            parameters: { goalId: goal.id },
          },
          generatedAt: new Date(),
          delivered: false,
          acknowledged: false,
        });
      }
    }
  }

  return insights;
}

/**
 * Generate thesis-related insights
 */
async function generateThesisInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];
  const theses = await UserDataService.loadAllTheses(userId);

  for (const thesis of theses) {
    // Check if thesis is stale (not reviewed in 90+ days)
    const daysSinceReview = Math.floor(
      (Date.now() - thesis.lastReviewed.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceReview >= 90) {
      insights.push({
        id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        type: 'thesis_check',
        priority: 'medium',
        title: `Time to review ${thesis.symbol}`,
        message: `It's been ${daysSinceReview} days since you reviewed your ${thesis.symbol} thesis. Your original reasoning: "${thesis.thesis.slice(0, 100)}..."`,
        actionable: true,
        action: {
          type: 'review_thesis',
          parameters: { symbol: thesis.symbol },
        },
        generatedAt: new Date(),
        delivered: false,
        acknowledged: false,
      });
    }

    // Check if price target hit (would need price data)
    // This is a placeholder - in production would check real prices
    if (thesis.exitCriteria.priceTarget) {
      const fundamentals = await getCompanyFundamentals(thesis.symbol);
      // Note: fundamentals doesn't include current price in our mock
      // In production, you'd check actual price vs target
    }
  }

  return insights;
}

/**
 * Generate behavioral insights
 */
async function generateBehavioralInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];
  const firestore = getQuantFirestore();
  const behavioral = await firestore.loadBehavioralTracking(userId);

  if (!behavioral) {
    return insights;
  }

  // Check for recent panic sells (within last 7 days)
  const recentPanicSells = behavioral.panicSells?.filter(
    (e: { date: Date }) => Date.now() - new Date(e.date).getTime() < 7 * 24 * 60 * 60 * 1000
  ) || [];

  if (recentPanicSells.length > 0) {
    insights.push({
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: 'behavioral_pattern',
      priority: 'high',
      title: "Let's talk about this week",
      message: `I noticed some stress-driven decisions this week. Remember: you've weathered storms before. Want to review your investment theses together?`,
      actionable: true,
      action: {
        type: 'review_crisis_history',
        parameters: {},
      },
      generatedAt: new Date(),
      delivered: false,
      acknowledged: false,
    });
  }

  // Check emotional control score
  if (behavioral.currentEmotionalControlScore < 50) {
    insights.push({
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: 'behavioral_pattern',
      priority: 'medium',
      title: 'Building emotional discipline',
      message: `Your emotional control score is at ${behavioral.currentEmotionalControlScore}. Let's work on building resilience for market volatility.`,
      actionable: true,
      action: {
        type: 'behavioral_coaching',
        parameters: {},
      },
      generatedAt: new Date(),
      delivered: false,
      acknowledged: false,
    });
  }

  return insights;
}

/**
 * Generate peer comparison insights
 */
async function generatePeerInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];
  const firestore = getQuantFirestore();

  const profile = await firestore.loadFinancialProfile(userId);
  if (!profile) return insights;

  // Get peer comparison
  const savingsRate =
    profile.monthlyIncome > 0
      ? ((profile.monthlyIncome - profile.monthlyExpenses) / profile.monthlyIncome) * 100
      : 0;

  const comparison = PeerBenchmarks.getPeerComparison({
    age: profile.currentAge || 35,
    annualIncome: profile.monthlyIncome * 12,
    savingsRate,
    netWorth: 0, // Would need to calculate
    behavioralScore: 70,
    fireProgress: 0,
    hasEmergencyFund: true,
    hasAutomatedSavings: false,
    tracksbudget: false,
    hasIndexFunds: true,
  });

  // Generate insight if user moved to higher percentile
  if (comparison.percentiles.savingsRate >= 75) {
    insights.push({
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: 'peer_update',
      priority: 'low',
      title: 'Top 25%! 🌟',
      message: `Your ${savingsRate.toFixed(1)}% savings rate puts you in the top ${100 - comparison.percentiles.savingsRate}% of people your age. Keep it up!`,
      actionable: false,
      generatedAt: new Date(),
      delivered: false,
      acknowledged: false,
    });
  }

  return insights;
}

/**
 * Generate economic alert insights
 */
async function generateEconomicInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];

  // Check for significant economic changes
  const fedRate = await getEconomicIndicator('fed_rate');
  const unemployment = await getEconomicIndicator('unemployment');

  if (fedRate && fedRate.change && Math.abs(fedRate.change) >= 0.25) {
    const direction = fedRate.change > 0 ? 'raised' : 'lowered';
    insights.push({
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: 'economic_alert',
      priority: fedRate.change > 0.5 ? 'high' : 'medium',
      title: `Fed ${direction} rates`,
      message: `The Federal Reserve ${direction} rates by ${Math.abs(fedRate.change).toFixed(2)}% to ${fedRate.value.toFixed(2)}%. This affects mortgage rates, bonds, and savings yields.`,
      actionable: false,
      generatedAt: new Date(),
      delivered: false,
      acknowledged: false,
    });
  }

  return insights;
}

/**
 * Generate learning suggestion insights
 */
async function generateLearningInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];

  const nextTopic = await UserDataService.getNextLearningTopic(userId);
  if (nextTopic) {
    insights.push({
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: 'learning_suggestion',
      priority: 'low',
      title: `Ready to learn: ${nextTopic}`,
      message: `Based on your questions, I think you'd benefit from learning about ${nextTopic}. Want me to explain?`,
      actionable: true,
      action: {
        type: 'explain_concept',
        parameters: { topic: nextTopic },
      },
      generatedAt: new Date(),
      delivered: false,
      acknowledged: false,
    });
  }

  return insights;
}

/**
 * Generate anniversary insights
 */
async function generateAnniversaryInsights(userId: string): Promise<DailyInsight[]> {
  const insights: DailyInsight[] = [];

  // Check for investment anniversaries, FIRE journey milestones, etc.
  const theses = await UserDataService.loadAllTheses(userId);

  for (const thesis of theses) {
    const daysSincePurchase = Math.floor(
      (Date.now() - thesis.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 1 year anniversary
    if (daysSincePurchase >= 365 && daysSincePurchase < 366) {
      insights.push({
        id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        type: 'anniversary',
        priority: 'low',
        title: `1 Year with ${thesis.symbol}! 🎂`,
        message: `It's been exactly one year since you invested in ${thesis.symbol}. Your original thesis: "${thesis.thesis.slice(0, 80)}..." - still holding true?`,
        actionable: true,
        action: {
          type: 'review_thesis',
          parameters: { symbol: thesis.symbol },
        },
        generatedAt: new Date(),
        delivered: false,
        acknowledged: false,
      });
    }
  }

  return insights;
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate all daily insights for a user
 */
export async function generateDailyInsightsForUser(userId: string): Promise<DailyInsight[]> {
  log.info({ userId }, 'Generating daily insights');

  const allInsights: DailyInsight[] = [];

  try {
    const [
      goalInsights,
      thesisInsights,
      behavioralInsights,
      peerInsights,
      economicInsights,
      learningInsights,
      anniversaryInsights,
    ] = await Promise.all([
      generateGoalInsights(userId),
      generateThesisInsights(userId),
      generateBehavioralInsights(userId),
      generatePeerInsights(userId),
      generateEconomicInsights(userId),
      generateLearningInsights(userId),
      generateAnniversaryInsights(userId),
    ]);

    allInsights.push(
      ...goalInsights,
      ...thesisInsights,
      ...behavioralInsights,
      ...peerInsights,
      ...economicInsights,
      ...learningInsights,
      ...anniversaryInsights
    );

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    allInsights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Limit to top 5 insights per day
    const topInsights = allInsights.slice(0, 5);

    // Store insights (would save to Firestore in production)
    await storeInsightsForUser(userId, topInsights);

    log.info({ userId, totalGenerated: allInsights.length, stored: topInsights.length }, 'Daily insights generated');

    return topInsights;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate daily insights');
    return [];
  }
}

/**
 * Store insights for later delivery
 */
async function storeInsightsForUser(userId: string, insights: DailyInsight[]): Promise<void> {
  const firestore = getQuantFirestore();

  for (const insight of insights) {
    // Convert to QuantInsight format for storage
    const quantInsight: Omit<QuantInsight, 'id'> = {
      date: insight.generatedAt,
      type: 'general',
      title: insight.title,
      summary: insight.message,
      details: insight.details,
      actionable: insight.actionable,
      priority: insight.priority,
      acknowledged: false,
    };

    await firestore.saveQuantInsight(userId, quantInsight);
  }
}

/**
 * Get stored insights for a user
 */
export async function getStoredInsights(userId: string): Promise<DailyInsight[]> {
  const firestore = getQuantFirestore();
  const quantInsights = await firestore.loadQuantInsights(userId);

  // Filter to today's unacknowledged insights
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return quantInsights
    .filter((i) => i.date >= today && !i.acknowledged)
    .map((qi) => ({
      id: qi.id,
      userId,
      type: 'general' as InsightType,
      priority: qi.priority,
      title: qi.title,
      message: qi.summary,
      details: qi.details,
      actionable: qi.actionable,
      generatedAt: qi.date,
      delivered: false,
      acknowledged: qi.acknowledged || false,
    }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const DailyInsights = {
  generateDailyInsightsForUser,
  getStoredInsights,
};

export default DailyInsights;

