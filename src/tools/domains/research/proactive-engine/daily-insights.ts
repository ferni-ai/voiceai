/**
 * Daily Insights Generator
 *
 * Proactive insights for Peter's daily briefings.
 */

import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

/**
 * Insight structure.
 */
export interface QuantInsight {
  type: 'portfolio' | 'behavioral' | 'fire' | 'general';
  priority: 'high' | 'medium' | 'low';
  message: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  actionable: boolean;
  details?: string;
  date: Date;
}

/**
 * Generate portfolio insight.
 */
export function generatePortfolioInsight(portfolio: {
  holdings: Array<{ symbol: string; value: number; sector: string }>;
  totalValue: number;
}): QuantInsight {
  const now = new Date();

  if (!portfolio.holdings || portfolio.holdings.length === 0) {
    return {
      type: 'portfolio',
      priority: 'medium',
      message: 'Ready to start investing? I can help you build a diversified portfolio.',
      sentiment: 'neutral',
      actionable: true,
      date: now,
    };
  }

  // Calculate sector concentration
  const sectorValues: Record<string, number> = {};
  for (const holding of portfolio.holdings) {
    sectorValues[holding.sector] = (sectorValues[holding.sector] || 0) + holding.value;
  }

  const totalValue = portfolio.totalValue || Object.values(sectorValues).reduce((a, b) => a + b, 0);
  const sectorPercentages = Object.entries(sectorValues)
    .map(([sector, value]) => ({
      sector,
      percentage: (value / totalValue) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const topSector = sectorPercentages[0];

  if (topSector && topSector.percentage > 60) {
    return {
      type: 'portfolio',
      priority: 'high',
      message: `Your ${topSector.sector.toLowerCase()} allocation is at ${Math.round(topSector.percentage)}%. Consider diversifying.`,
      sentiment: 'negative',
      actionable: true,
      details: 'Concentration in a single sector increases risk. Index funds can help diversify.',
      date: now,
    };
  }

  if (topSector && topSector.percentage > 40) {
    return {
      type: 'portfolio',
      priority: 'medium',
      message: `${topSector.sector} makes up ${Math.round(topSector.percentage)}% of your portfolio. Worth monitoring.`,
      sentiment: 'neutral',
      actionable: false,
      date: now,
    };
  }

  return {
    type: 'portfolio',
    priority: 'low',
    message: 'Your portfolio is well-diversified across sectors.',
    sentiment: 'positive',
    actionable: false,
    date: now,
  };
}

/**
 * Generate behavioral insight.
 */
export function generateBehavioralInsight(behavior: {
  checksThisWeek: number;
  averageChecks: number;
  panicSells: number;
  timingAttempts: number;
  impulsePurchases: number;
  behavioralScore?: number;
}): QuantInsight {
  const now = new Date();

  // Check for panic selling pattern
  if (behavior.panicSells > 0) {
    return {
      type: 'behavioral',
      priority: 'high',
      message: 'I noticed some reactive selling recently. Let\'s talk about your thesis for those positions.',
      sentiment: 'negative',
      actionable: true,
      details: 'Panic selling often leads to regret. Historical data shows most recover within 18 months.',
      date: now,
    };
  }

  // Check for timing attempts
  if (behavior.timingAttempts > 2) {
    return {
      type: 'behavioral',
      priority: 'high',
      message: 'Multiple timing attempts detected. Time in market beats timing the market.',
      sentiment: 'negative',
      actionable: true,
      date: now,
    };
  }

  // Check for over-monitoring
  if (behavior.checksThisWeek > behavior.averageChecks * 2) {
    return {
      type: 'behavioral',
      priority: 'medium',
      message: `You've been checking more than usual this week. Everything okay?`,
      sentiment: 'neutral',
      actionable: false,
      date: now,
    };
  }

  // Good behavior
  if (behavior.behavioralScore && behavior.behavioralScore > 80) {
    return {
      type: 'behavioral',
      priority: 'low',
      message: 'Your investing discipline is excellent. Keep staying the course!',
      sentiment: 'positive',
      actionable: false,
      date: now,
    };
  }

  return {
    type: 'behavioral',
    priority: 'low',
    message: 'Your investing behavior looks healthy.',
    sentiment: 'positive',
    actionable: false,
    date: now,
  };
}

/**
 * Generate FIRE progress insight.
 */
export function generateFIREInsight(fire: {
  currentProgress: number;
  previousProgress: number;
  monthlyContribution: number;
  targetNumber: number;
  currentNetWorth: number;
  projectedAge: number;
}): QuantInsight {
  const now = new Date();
  const progressDelta = fire.currentProgress - fire.previousProgress;

  // Milestone proximity check
  const milestones = [10, 25, 50, 75, 100];
  for (const milestone of milestones) {
    if (fire.currentProgress >= milestone - 2 && fire.currentProgress < milestone) {
      return {
        type: 'fire',
        priority: 'medium',
        message: `You're approaching ${milestone}% of your FIRE goal! Just ${(milestone - fire.currentProgress).toFixed(1)}% to go.`,
        sentiment: 'positive',
        actionable: false,
        date: now,
      };
    }
    if (fire.previousProgress < milestone && fire.currentProgress >= milestone) {
      return {
        type: 'fire',
        priority: 'high',
        message: `Congratulations! You've hit ${milestone}% of your FIRE goal! 🎉`,
        sentiment: 'positive',
        actionable: false,
        date: now,
      };
    }
  }

  // Good progress
  if (progressDelta >= 1) {
    return {
      type: 'fire',
      priority: 'low',
      message: `Great progress! You've moved ${progressDelta.toFixed(1)}% closer to FIRE.`,
      sentiment: 'positive',
      actionable: false,
      date: now,
    };
  }

  // Early stage encouragement
  if (fire.currentProgress < 10) {
    return {
      type: 'fire',
      priority: 'low',
      message: `You're ${fire.currentProgress.toFixed(0)}% of the way to FIRE. The early phase is the hardest - you're building the foundation!`,
      sentiment: 'neutral',
      actionable: false,
      date: now,
    };
  }

  return {
    type: 'fire',
    priority: 'low',
    message: `You're at ${fire.currentProgress.toFixed(0)}% of your FIRE goal. On track for age ${fire.projectedAge}.`,
    sentiment: 'neutral',
    actionable: false,
    date: now,
  };
}

/**
 * Generate economic indicator insight.
 */
export function generateEconomicInsight(economic: {
  indicator: 'CPI' | 'FED_FUNDS' | 'UNEMPLOYMENT' | 'GDP';
  currentValue: number;
  previousValue: number;
  historicalAverage: number;
  trend: 'rising' | 'falling' | 'stable';
}): QuantInsight {
  const now = new Date();
  const { indicator, currentValue, previousValue, historicalAverage, trend } = economic;

  if (indicator === 'CPI') {
    const direction = currentValue > previousValue ? 'up' : 'down';
    return {
      type: 'general',
      priority: currentValue > 4 ? 'medium' : 'low',
      message: `Inflation is at ${currentValue}% (${direction} from ${previousValue}%). Historical average: ${historicalAverage}%.`,
      sentiment: currentValue > historicalAverage ? 'negative' : 'positive',
      actionable: false,
      date: now,
    };
  }

  if (indicator === 'FED_FUNDS') {
    return {
      type: 'general',
      priority: trend === 'rising' ? 'medium' : 'low',
      message: `Fed rate at ${currentValue}% (${trend}). This affects borrowing costs and bond yields.`,
      sentiment: 'neutral',
      actionable: false,
      date: now,
    };
  }

  if (indicator === 'UNEMPLOYMENT') {
    return {
      type: 'general',
      priority: 'low',
      message: `Unemployment at ${currentValue}% (${trend}). Historical average: ${historicalAverage}%.`,
      sentiment: currentValue < historicalAverage ? 'positive' : 'negative',
      actionable: false,
      date: now,
    };
  }

  return {
    type: 'general',
    priority: 'low',
    message: `${indicator}: ${currentValue} (${trend}).`,
    sentiment: 'neutral',
    actionable: false,
    date: now,
  };
}

/**
 * Format insights into a speech-friendly daily briefing.
 */
export function formatDailyBriefing(insights: QuantInsight[], userName: string): string {
  if (insights.length === 0) {
    return `Good morning, ${userName}! Everything's looking good. Your portfolio and habits are on track. Let me know if you'd like to dive into anything specific today.`;
  }

  // Sort by priority
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  const sorted = [...insights].sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]
  );

  const parts: string[] = [];
  parts.push(`Good morning, ${userName}! Here's your financial update.`);

  // Add high priority items first
  const highPriority = sorted.filter((i) => i.priority === 'high');
  if (highPriority.length > 0) {
    parts.push('First, some important items:');
    for (const insight of highPriority) {
      parts.push(insight.message);
      if (insight.details) {
        parts.push(insight.details);
      }
    }
  }

  // Add medium priority
  const mediumPriority = sorted.filter((i) => i.priority === 'medium');
  if (mediumPriority.length > 0) {
    parts.push("Also worth noting:");
    for (const insight of mediumPriority) {
      parts.push(insight.message);
    }
  }

  // Add positive low priority as encouragement
  const positiveLow = sorted.filter((i) => i.priority === 'low' && i.sentiment === 'positive');
  if (positiveLow.length > 0) {
    parts.push('And some good news:');
    for (const insight of positiveLow) {
      parts.push(insight.message);
    }
  }

  parts.push("Let me know if you'd like to discuss any of this in more detail.");

  return parts.join(' ');
}
