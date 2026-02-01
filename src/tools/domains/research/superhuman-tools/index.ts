/**
 * Peter's Superhuman Tools
 *
 * These tools leverage Peter's expanded data model to provide insights
 * that go beyond what any human advisor could offer.
 *
 * CATEGORIES:
 * 1. N=1 Personal Analytics - Decision quality, sleep correlation, energy prediction
 * 2. Research Synthesis - Evidence scoring, paper synthesis, counter-arguments
 * 3. Predictive Modeling - Goal prediction, trajectory modeling, habit survival
 * 4. Financial Research - SEC analysis, insider tracking, options flow, macro bridge
 * 5. Experimentation - A/B testing, Bayesian updating, hypothesis tracking
 * 6. External Data - Local economics, industry trends, news sentiment
 * 7. Network Analytics - Communication patterns, relationship health, influence mapping
 *
 * @module tools/domains/research/superhuman-tools
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import { UserDataService } from '../user-data/index.js';
import { getQuantFirestore } from '../quant-firestore.js';
import { getCompanyFundamentals } from '../external-apis.js';
import type {
  InvestmentThesis,
  FinancialGoal,
  LifeEvent,
  RiskEvent,
  KnowledgeGap,
} from '../user-data/types.js';

// Import new superhuman tool categories
import { n1AnalyticsTools } from './n1-analytics.js';
import { researchSynthesisTools } from './research-synthesis.js';
import { predictiveModelingTools } from './predictive-modeling.js';
import { financialResearchTools } from './financial-research.js';
import { experimentationTools } from './experimentation.js';
import { externalDataTools } from './external-data.js';
import { networkAnalyticsTools } from './network-analytics.js';
import { getUserIdFromContext } from './firestore-persistence.js';

const log = getLogger();

// ============================================================================
// THESIS TOOLS
// ============================================================================

/**
 * Save why you bought a stock - Peter will remind you during volatility
 */
export const saveInvestmentThesis = llm.tool({
  description:
    'Save your investment thesis for a stock. Peter will remind you of this during market volatility.',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    thesis: z.string().describe('Why you bought this stock'),
    catalysts: z.array(z.string()).optional().describe('Expected catalysts for growth'),
    risks: z.array(z.string()).optional().describe('Known risks'),
    priceTarget: z.number().optional().describe('Target price to sell'),
    timeHorizon: z.string().optional().describe('How long you plan to hold'),
    confidence: z.number().min(1).max(10).describe('How confident are you? 1-10'),
  }),
  execute: async (
    params: {
      symbol: string;
      thesis: string;
      catalysts?: string[];
      risks?: string[];
      priceTarget?: number;
      timeHorizon?: string;
      confidence: number;
    },
    { ctx }: { ctx: unknown }
  ) => {
    const { symbol, thesis, priceTarget, timeHorizon, confidence } = params;
    const catalysts = params.catalysts || [];
    const risks = params.risks || [];
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are to save this.';

    const investmentThesis: InvestmentThesis = {
      symbol: symbol.toUpperCase(),
      purchaseDate: new Date(),
      thesis,
      catalysts,
      risks,
      exitCriteria: {
        priceTarget,
        timeHorizon,
        fundamentalTriggers: [],
      },
      emotionalState: {
        atPurchase: confidence >= 7 ? 'confident' : confidence >= 4 ? 'researched' : 'nervous',
        confidenceLevel: confidence,
      },
      updates: [],
      lastReviewed: new Date(),
    };

    await UserDataService.saveInvestmentThesis(userId, investmentThesis);

    return [
      `✅ Investment thesis saved for ${symbol.toUpperCase()}!`,
      '',
      `📝 Your Thesis:`,
      `"${thesis}"`,
      '',
      catalysts.length > 0 ? `🎯 Catalysts: ${catalysts.join(', ')}` : '',
      risks.length > 0 ? `⚠️ Risks: ${risks.join(', ')}` : '',
      priceTarget ? `💰 Target: $${priceTarget}` : '',
      timeHorizon ? `⏰ Horizon: ${timeHorizon}` : '',
      `📊 Confidence: ${confidence}/10`,
      '',
      "I'll remind you of this when the market gets choppy. Your future self will thank you.",
    ]
      .filter(Boolean)
      .join('\n');
  },
});

/**
 * Get reminded of your thesis - especially useful during volatility
 */
export const remindThesis = llm.tool({
  description:
    'Remind yourself why you bought a stock. Essential during market drops when emotions run high.',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
  }),
  execute: async (params: { symbol: string }, { ctx }: { ctx: unknown }) => {
    const { symbol } = params;
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const thesis = await UserDataService.loadInvestmentThesis(userId, symbol);
    if (!thesis) {
      return `I don't have a thesis saved for ${symbol.toUpperCase()}. Would you like to create one?`;
    }

    // Get current fundamentals to compare
    const fundamentals = await getCompanyFundamentals(symbol);
    const daysSincePurchase = Math.floor(
      (Date.now() - thesis.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const lines = [
      `📋 **Your Investment Thesis for ${symbol.toUpperCase()}**`,
      '',
      `🗓️ Purchased: ${thesis.purchaseDate.toLocaleDateString()} (${daysSincePurchase} days ago)`,
      '',
      `📝 **Why You Bought:**`,
      `"${thesis.thesis}"`,
      '',
    ];

    if (thesis.catalysts.length > 0) {
      lines.push(`🎯 **Catalysts You Expected:**`);
      for (const catalyst of thesis.catalysts) {
        lines.push(`  • ${catalyst}`);
      }
      lines.push('');
    }

    if (thesis.risks.length > 0) {
      lines.push(`⚠️ **Risks You Knew About:**`);
      for (const risk of thesis.risks) {
        lines.push(`  • ${risk}`);
      }
      lines.push('');
    }

    if (thesis.exitCriteria.priceTarget) {
      lines.push(`💰 **Your Target:** $${thesis.exitCriteria.priceTarget}`);
    }

    lines.push('');
    lines.push(`📊 **Confidence at Purchase:** ${thesis.emotionalState.confidenceLevel}/10`);

    if (thesis.updates.length > 0) {
      lines.push('');
      lines.push(`📝 **Updates:**`);
      for (const update of thesis.updates.slice(-3)) {
        lines.push(`  • ${update.date.toLocaleDateString()}: ${update.note}`);
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('**The Question:** Has anything changed that invalidates your original thesis?');
    lines.push('If not, the price movement is just noise. Your thesis is what matters.');

    return lines.join('\n');
  },
});

// ============================================================================
// GOAL TOOLS
// ============================================================================

/**
 * Create a financial goal with milestone tracking
 */
export const createFinancialGoal = llm.tool({
  description:
    'Create a financial goal. Peter will track progress and celebrate milestones with you.',
  parameters: z.object({
    name: z.string().describe('Name for this goal'),
    type: z.enum([
      'emergency_fund',
      'retirement',
      'purchase',
      'debt_payoff',
      'investment',
      'education',
      'travel',
      'custom',
    ]),
    targetAmount: z.number().describe('Target amount in dollars'),
    targetDate: z.string().optional().describe('Target date (YYYY-MM-DD)'),
    currentAmount: z.number().default(0).describe('Current progress'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    notes: z.string().optional(),
  }),
  execute: async (
    params: {
      name: string;
      type: string;
      targetAmount: number;
      targetDate?: string;
      currentAmount: number;
      priority: string;
      notes?: string;
    },
    { ctx }: { ctx: unknown }
  ) => {
    const { name, type, targetAmount, targetDate, currentAmount, priority, notes } = params;
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const goal: FinancialGoal = {
      id: `goal_${Date.now()}`,
      name,
      type: type as FinancialGoal['type'],
      target: {
        amount: targetAmount,
        date: targetDate ? new Date(targetDate) : undefined,
      },
      current: {
        amount: currentAmount,
        lastUpdated: new Date(),
      },
      progress: {
        percentage: (currentAmount / targetAmount) * 100,
        onTrack: true,
      },
      milestones: [
        { percentage: 10 },
        { percentage: 25 },
        { percentage: 50 },
        { percentage: 75 },
        { percentage: 90 },
        { percentage: 100 },
      ],
      priority: priority as FinancialGoal['priority'],
      createdAt: new Date(),
      notes,
    };

    await UserDataService.saveFinancialGoal(userId, goal);

    const monthsToTarget = targetDate
      ? Math.ceil((new Date(targetDate).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000))
      : null;
    const monthlyNeeded = monthsToTarget ? (targetAmount - currentAmount) / monthsToTarget : null;

    return [
      `🎯 Goal Created: ${name}!`,
      '',
      `📊 Target: $${targetAmount.toLocaleString()}`,
      `📈 Current: $${currentAmount.toLocaleString()} (${((currentAmount / targetAmount) * 100).toFixed(1)}%)`,
      targetDate ? `📅 Target Date: ${new Date(targetDate).toLocaleDateString()}` : '',
      monthlyNeeded ? `💰 Monthly Needed: $${monthlyNeeded.toFixed(0).toLocaleString()}` : '',
      '',
      "I'll celebrate with you at 10%, 25%, 50%, 75%, 90%, and 100%!",
    ]
      .filter(Boolean)
      .join('\n');
  },
});

/**
 * Update progress on a goal
 */
export const updateGoalProgress = llm.tool({
  description: 'Update your progress on a financial goal.',
  parameters: z.object({
    goalName: z.string().describe('Name of the goal to update'),
    newAmount: z.number().describe('New current amount'),
  }),
  execute: async (params: { goalName: string; newAmount: number }, { ctx }: { ctx: unknown }) => {
    const { goalName, newAmount } = params;
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const goals = await UserDataService.loadFinancialGoals(userId);
    const goal = goals.find((g) => g.name.toLowerCase() === goalName.toLowerCase());

    if (!goal) {
      return `I couldn't find a goal named "${goalName}". Your goals: ${goals.map((g) => g.name).join(', ')}`;
    }

    const result = await UserDataService.updateGoalProgress(userId, goal.id, newAmount);
    if (!result) return 'Failed to update goal progress.';

    const { goal: updatedGoal, newMilestones } = result;

    const lines = [
      `✅ Updated: ${updatedGoal.name}`,
      '',
      `📈 Progress: $${newAmount.toLocaleString()} / $${updatedGoal.target.amount.toLocaleString()}`,
      `📊 ${updatedGoal.progress.percentage.toFixed(1)}% complete`,
    ];

    // Celebrate milestones!
    if (newMilestones.length > 0) {
      lines.push('');
      lines.push('🎉 **MILESTONE REACHED!** 🎉');
      for (const milestone of newMilestones) {
        if (milestone.percentage === 100) {
          lines.push(`🏆 YOU DID IT! Goal COMPLETE! 🏆`);
        } else if (milestone.percentage >= 75) {
          lines.push(`🔥 ${milestone.percentage}% - You're in the home stretch!`);
        } else if (milestone.percentage >= 50) {
          lines.push(
            `💪 ${milestone.percentage}% - Halfway there! The compound effect is working.`
          );
        } else if (milestone.percentage >= 25) {
          lines.push(`🚀 ${milestone.percentage}% - Quarter way! Building momentum.`);
        } else {
          lines.push(`✨ ${milestone.percentage}% - Every journey begins with a single step!`);
        }
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// BEHAVIORAL PREDICTION
// ============================================================================

/**
 * Predict how you might react to market events
 */
export const predictBehavior = llm.tool({
  description:
    'Predict how you might react to future market events based on your history and patterns from similar investors.',
  parameters: z.object({
    scenario: z.enum([
      'market_drop_10',
      'market_drop_20',
      'market_drop_30',
      'rate_hike',
      'recession_news',
    ]),
  }),
  execute: async (params: { scenario: string }, { ctx }: { ctx: unknown }) => {
    const { scenario } = params;
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const crisisHistory = await UserDataService.getUserCrisisHistory(userId);
    const firestore = getQuantFirestore();
    const behavioral = await firestore.loadBehavioralTracking(userId);

    const scenarioDescriptions: Record<string, string> = {
      market_drop_10: '10% market correction',
      market_drop_20: '20% bear market',
      market_drop_30: '30% crash (2008-level)',
      rate_hike: 'unexpected Fed rate hike',
      recession_news: 'recession officially declared',
    };

    const lines = [`🔮 **Behavioral Prediction: ${scenarioDescriptions[scenario]}**`, ''];

    // Personal history
    if (crisisHistory.totalEvents > 0) {
      lines.push(`📊 **Your History (${crisisHistory.totalEvents} past events):**`);
      lines.push(`  • Held firm: ${crisisHistory.heldCount} times`);
      lines.push(`  • Bought more: ${crisisHistory.boughtMoreCount} times`);
      lines.push(`  • Panic sold: ${crisisHistory.panicSellCount} times`);
      if (crisisHistory.averageRecoveryTime > 0) {
        lines.push(`  • Average recovery: ${Math.round(crisisHistory.averageRecoveryTime)} days`);
      }
      lines.push('');
    }

    // Behavioral score impact
    const emotionalControl = behavioral?.currentEmotionalControlScore || 70;
    let prediction = '';
    let probability = 0;

    if (emotionalControl >= 80) {
      prediction = "You'll likely stay calm and stick to your plan";
      probability = 15;
    } else if (emotionalControl >= 60) {
      prediction = 'You may feel anxious but will probably hold';
      probability = 35;
    } else {
      prediction = 'You might feel a strong urge to sell';
      probability = 55;
    }

    // Adjust based on history
    if (crisisHistory.panicSellCount > 1) {
      probability = Math.min(probability + 20, 90);
      prediction = 'Based on past patterns, you may feel pressure to sell';
    } else if (crisisHistory.heldCount > 2) {
      probability = Math.max(probability - 15, 5);
      prediction = 'Your track record shows you can handle volatility';
    }

    lines.push(`🎯 **Prediction:**`);
    lines.push(`${prediction}`);
    lines.push(`Estimated probability of panic decision: ${probability}%`);
    lines.push('');

    // Lessons from history
    if (crisisHistory.lessonsLearned.length > 0) {
      lines.push(`💡 **Your Past Lessons:**`);
      for (const lesson of crisisHistory.lessonsLearned.slice(-3)) {
        lines.push(`  • "${lesson}"`);
      }
      lines.push('');
    }

    // Recommendation
    lines.push(`📝 **Recommendation:**`);
    if (probability > 50) {
      lines.push(
        'Write down your investment theses NOW. When the drop comes, read them before making any decisions.'
      );
      lines.push('Consider setting a 48-hour cooling-off rule for any sell decisions.');
    } else {
      lines.push(
        "You're well-prepared. Just remember: volatility is the price of admission for long-term returns."
      );
    }

    return lines.join('\n');
  },
});

// ============================================================================
// LIFE EVENT TOOLS
// ============================================================================

/**
 * Record a life event that affects your finances
 */
export const recordLifeEvent = llm.tool({
  description:
    'Record a significant life event. Peter will adjust advice based on your life circumstances.',
  parameters: z.object({
    type: z.enum([
      'career',
      'family',
      'health',
      'financial',
      'education',
      'housing',
      'relationship',
    ]),
    description: z.string().describe('What happened'),
    incomeChange: z.number().optional().describe('Monthly income change (positive or negative)'),
    expenseChange: z.number().optional().describe('Monthly expense change (positive or negative)'),
    oneTimeImpact: z.number().optional().describe('One-time financial impact'),
  }),
  execute: async (
    params: {
      type: string;
      description: string;
      incomeChange?: number;
      expenseChange?: number;
      oneTimeImpact?: number;
    },
    { ctx }: { ctx: unknown }
  ) => {
    const { type, description, incomeChange, expenseChange, oneTimeImpact } = params;
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const direction =
      (incomeChange || 0) - (expenseChange || 0) + (oneTimeImpact || 0) > 0
        ? 'positive'
        : (incomeChange || 0) - (expenseChange || 0) + (oneTimeImpact || 0) < 0
          ? 'negative'
          : 'neutral';

    await UserDataService.saveLifeEvent(userId, {
      id: `event_${Date.now()}`,
      date: new Date(),
      type: type as LifeEvent['type'],
      subtype: 'major_loss', // Use generic financial subtype for custom events
      description,
      financialImpact: {
        incomeChange,
        expenseChange,
        oneTimeImpact,
        direction,
      },
      emotionalWeight: 'moderate',
      advisoryImplications: [],
      acknowledged: false,
    });

    const lines = [`📝 Life event recorded: ${description}`, ''];

    if (incomeChange) {
      lines.push(
        `💰 Income change: ${incomeChange > 0 ? '+' : ''}$${incomeChange.toLocaleString()}/month`
      );
    }
    if (expenseChange) {
      lines.push(
        `📤 Expense change: ${expenseChange > 0 ? '+' : ''}$${expenseChange.toLocaleString()}/month`
      );
    }
    if (oneTimeImpact) {
      lines.push(
        `💵 One-time impact: ${oneTimeImpact > 0 ? '+' : ''}$${oneTimeImpact.toLocaleString()}`
      );
    }

    lines.push('');
    lines.push("I'll factor this into my analysis and recommendations going forward.");

    if (direction === 'positive') {
      lines.push("Let's talk about how to put this positive change to work for your goals!");
    } else if (direction === 'negative') {
      lines.push("Let's review your budget and goals to make sure you stay on track.");
    }

    return lines.join('\n');
  },
});

// ============================================================================
// KNOWLEDGE GAP TOOLS
// ============================================================================

/**
 * Get your next recommended learning topic
 */
export const getNextLesson = llm.tool({
  description:
    'Find out what financial topic you should learn next based on your goals and knowledge gaps.',
  parameters: z.object({}),
  execute: async (_params: Record<string, never>, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const nextTopic = await UserDataService.getNextLearningTopic(userId);
    const profile = await UserDataService.loadKnowledgeProfile(userId);

    if (!nextTopic) {
      return [
        "You're doing great! I haven't identified any critical knowledge gaps.",
        '',
        'Your strengths:',
        ...(profile?.strengths.map((s) => `  • ${s}`) || ['  • Building your knowledge base']),
        '',
        "Want me to quiz you on any topic to make sure you're solid?",
      ].join('\n');
    }

    const gap = profile?.gaps.find((g) => g.topic === nextTopic);

    return [
      `📚 **Recommended Learning: ${nextTopic}**`,
      '',
      gap?.context ? `Why: ${gap.context}` : '',
      gap?.severity === 'critical' ? '⚠️ This is critical for your financial success.' : '',
      '',
      `Would you like me to explain ${nextTopic}?`,
    ]
      .filter(Boolean)
      .join('\n');
  },
});

// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================

// Original tools (maintained for backwards compatibility)
export const originalSuperhumanTools = {
  saveInvestmentThesis,
  remindThesis,
  createFinancialGoal,
  updateGoalProgress,
  predictBehavior,
  recordLifeEvent,
  getNextLesson,
};

// All superhuman tools combined
export const superhumanTools = {
  // Original tools
  ...originalSuperhumanTools,

  // N=1 Personal Analytics
  ...n1AnalyticsTools,

  // Research Synthesis
  ...researchSynthesisTools,

  // Predictive Modeling
  ...predictiveModelingTools,

  // Financial Research
  ...financialResearchTools,

  // Experimentation Framework
  ...experimentationTools,

  // External Data Integration
  ...externalDataTools,

  // Network Analytics
  ...networkAnalyticsTools,
};

// Export individual categories for selective import
export {
  n1AnalyticsTools,
  researchSynthesisTools,
  predictiveModelingTools,
  financialResearchTools,
  experimentationTools,
  externalDataTools,
  networkAnalyticsTools,
};

// Re-export types
export * from './types.js';

export default superhumanTools;
