/**
 * Research & Insights Team Handlers (Peter John)
 *
 * Handlers for cross-domain insights, pattern recognition,
 * and proactive analysis across user data.
 *
 * USAGE:
 *   import { registerResearchHandlers } from './handlers/research.js';
 *   registerResearchHandlers('peter-john');
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolExecutionRequest, ToolExecutionResult, AgentId } from '../../agent-bus.js';
import { registerTeamHandler } from '../index.js';
import type { TeamHandlerDefinition } from '../types.js';
import { getLifeDataStore } from '../../life-data-store.js';

// ============================================================================
// INSIGHT HANDLERS
// ============================================================================

/**
 * Handler: Synthesize insights
 * Capability: insights
 */
const synthesizeInsightsHandler: TeamHandlerDefinition = {
  id: 'synthesizeInsights',
  name: 'Synthesize Insights',
  description: 'Synthesize insights across goals, milestones, and financial data',
  capability: 'insights',
  tags: ['insights', 'analysis', 'cross-domain'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { domains = ['all'] } = request.params as { domains?: string[] };
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();

      // Gather data from multiple domains
      const [goals, milestones, savingsGoals, budgets] = await Promise.all([
        store.getGoals(userId),
        store.getMilestones(userId),
        store.getMilestoneSavingsGoals(userId),
        store.getMilestoneBudgets(userId),
      ]);

      const insights: string[] = [];

      // Goal-milestone alignment
      const activeGoals = goals.filter((g) => g.status === 'in-progress');
      const activeMilestones = milestones.filter((m) => m.status === 'in-progress');

      if (activeGoals.length > 0 && activeMilestones.length === 0) {
        insights.push(
          '📊 You have active goals but no milestones. Consider breaking goals into smaller milestones.'
        );
      }

      // Financial-goal alignment
      if (activeGoals.length > savingsGoals.length) {
        insights.push(
          '💰 Some goals may benefit from linked savings plans. Consider setting up dedicated savings goals.'
        );
      }

      // Budget utilization
      const overBudget = budgets.filter((b) => (b.spent || 0) > b.totalBudget);
      if (overBudget.length > 0) {
        insights.push(
          `⚠️ ${overBudget.length} budget(s) are over limit. Review spending in: ${overBudget.map((b) => b.name).join(', ')}`
        );
      }

      // Progress patterns
      const lowProgressMilestones = activeMilestones.filter((m) => {
        const progress =
          m.checklist.length > 0
            ? m.checklist.filter((c) => c.completed).length / m.checklist.length
            : 0;
        return progress < 0.25 && m.targetDate;
      });
      if (lowProgressMilestones.length > 0) {
        insights.push(
          `📅 ${lowProgressMilestones.length} milestone(s) have low progress with upcoming target dates.`
        );
      }

      // Savings momentum
      const onTrackSavings = savingsGoals.filter(
        (s) => s.status === 'on-track' || s.status === 'active'
      );
      if (onTrackSavings.length > 0) {
        const totalProgress =
          onTrackSavings.reduce((sum, s) => sum + s.progressPercent, 0) / onTrackSavings.length;
        if (totalProgress > 50) {
          insights.push(
            `🎉 Great progress! Your savings goals are ${Math.round(totalProgress)}% complete on average.`
          );
        }
      }

      if (insights.length === 0) {
        insights.push('✨ Everything looks well-balanced! Keep up the great work.');
      }

      const result = `🔍 **Cross-Domain Insights**\n\n${insights.join('\n\n')}`;

      getLogger().info({ userId, insightCount: insights.length }, 'Insights synthesized');

      return { success: true, result, executedBy: 'peter-john' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to synthesize insights');
      return { success: false, error: 'Failed to analyze data', executedBy: 'peter-john' };
    }
  },
};

/**
 * Handler: Spot anomalies
 * Capability: analysis
 */
const spotAnomaliesHandler: TeamHandlerDefinition = {
  id: 'spotAnomalies',
  name: 'Spot Anomalies',
  description: 'Detect unusual patterns or anomalies in user data',
  capability: 'analysis',
  tags: ['anomalies', 'patterns', 'alerts'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();

      const [goals, milestones, savingsGoals, budgets] = await Promise.all([
        store.getGoals(userId),
        store.getMilestones(userId),
        store.getMilestoneSavingsGoals(userId),
        store.getMilestoneBudgets(userId),
      ]);

      const anomalies: string[] = [];

      // Stalled progress (no update in 30+ days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const stalledGoals = goals.filter(
        (g) => g.status === 'in-progress' && new Date(g.updatedAt) < thirtyDaysAgo
      );
      if (stalledGoals.length > 0) {
        anomalies.push(`⏸️ ${stalledGoals.length} goal(s) haven't been updated in 30+ days`);
      }

      // Savings behind schedule
      const behindSavings = savingsGoals.filter((s) => s.status === 'behind');
      if (behindSavings.length > 0) {
        anomalies.push(`📉 ${behindSavings.length} savings goal(s) are behind schedule`);
      }

      // Overspending trend
      const totalBudget = budgets.reduce((sum, b) => sum + b.totalBudget, 0);
      const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
      if (totalBudget > 0 && totalSpent / totalBudget > 0.9) {
        anomalies.push(
          `💸 Budget utilization is at ${Math.round((totalSpent / totalBudget) * 100)}% - consider reviewing spending`
        );
      }

      // Target date clustering
      const upcomingTargetDates = milestones
        .filter((m) => m.targetDate && new Date(m.targetDate) > new Date())
        .map((m) => new Date(m.targetDate!));

      // Check if multiple target dates in same week
      const weekCounts: Record<string, number> = {};
      for (const d of upcomingTargetDates) {
        const weekKey = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;
        weekCounts[weekKey] = (weekCounts[weekKey] || 0) + 1;
      }

      const busyWeeks = Object.entries(weekCounts).filter(([_, count]) => count >= 3);
      if (busyWeeks.length > 0) {
        anomalies.push(
          `📆 Heavy target date clustering detected - ${busyWeeks.length} week(s) with 3+ milestones`
        );
      }

      if (anomalies.length === 0) {
        return {
          success: true,
          result: '✅ No anomalies detected. Your data looks healthy!',
          executedBy: 'peter-john',
        };
      }

      const result = `⚠️ **Anomalies Detected (${anomalies.length})**\n\n${anomalies.join('\n\n')}`;

      getLogger().info({ userId, anomalyCount: anomalies.length }, 'Anomalies detected');

      return { success: true, result, executedBy: 'peter-john' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to spot anomalies');
      return { success: false, error: 'Failed to analyze data', executedBy: 'peter-john' };
    }
  },
};

/**
 * Handler: Find correlations
 * Capability: analysis
 */
const findCorrelationsHandler: TeamHandlerDefinition = {
  id: 'findCorrelations',
  name: 'Find Correlations',
  description: 'Find correlations between different data points',
  capability: 'analysis',
  tags: ['correlations', 'patterns', 'analysis'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();

      const [goals, milestones, savingsGoals] = await Promise.all([
        store.getGoals(userId),
        store.getMilestones(userId),
        store.getMilestoneSavingsGoals(userId),
      ]);

      const correlations: string[] = [];

      // Goals with linked savings tend to have better progress
      // Check if any savings goal has a linked milestone
      const linkedMilestoneIds = new Set(
        savingsGoals.map((s) => s.linkedMilestoneId).filter(Boolean)
      );
      const goalsWithLinkedSavings = goals.filter((g) => linkedMilestoneIds.size > 0);
      const goalsWithoutLinkedSavings = goals.filter((g) => linkedMilestoneIds.size === 0);

      if (goalsWithLinkedSavings.length > 0 && goalsWithoutLinkedSavings.length > 0) {
        const avgWithSavings =
          goalsWithLinkedSavings.reduce((sum, g) => sum + (g.progressPercent || 0), 0) /
          goalsWithLinkedSavings.length;
        const avgWithoutSavings =
          goalsWithoutLinkedSavings.reduce((sum, g) => sum + (g.progressPercent || 0), 0) /
          goalsWithoutLinkedSavings.length;

        if (avgWithSavings > avgWithoutSavings) {
          correlations.push(
            `📈 Goals with linked savings show ${Math.round(avgWithSavings - avgWithoutSavings)}% higher progress`
          );
        }
      }

      // Milestone completion patterns by category
      const completedMilestones = milestones.filter((m) => m.status === 'completed');
      if (completedMilestones.length >= 3) {
        correlations.push(
          `✅ You've completed ${completedMilestones.length} milestones - momentum is building!`
        );
      }

      // Savings consistency
      const activeSavings = savingsGoals.filter(
        (s) => s.status === 'active' || s.status === 'on-track'
      );
      if (activeSavings.length >= 2) {
        const avgProgress =
          activeSavings.reduce((sum, s) => sum + s.progressPercent, 0) / activeSavings.length;
        correlations.push(`💰 Active savings goals average ${Math.round(avgProgress)}% progress`);
      }

      if (correlations.length === 0) {
        correlations.push(
          '📊 Not enough data yet to identify meaningful correlations. Keep tracking your progress!'
        );
      }

      const result = `🔗 **Correlations Found**\n\n${correlations.join('\n\n')}`;

      return { success: true, result, executedBy: 'peter-john' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to find correlations');
      return { success: false, error: 'Failed to analyze correlations', executedBy: 'peter-john' };
    }
  },
};

/**
 * Handler: Project trends
 * Capability: analysis
 */
const projectTrendsHandler: TeamHandlerDefinition = {
  id: 'projectTrends',
  name: 'Project Trends',
  description: 'Project future trends based on current data',
  capability: 'analysis',
  additionalCapabilities: ['insights'],
  tags: ['trends', 'projections', 'forecasting'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { months = 3 } = request.params as { months?: number };
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();

      const [goals, savingsGoals, budgets] = await Promise.all([
        store.getGoals(userId),
        store.getMilestoneSavingsGoals(userId),
        store.getMilestoneBudgets(userId),
      ]);

      const projections: string[] = [];

      // Project savings completion
      for (const savings of savingsGoals.filter(
        (s) => s.status === 'active' || s.status === 'on-track'
      )) {
        const remaining = savings.targetAmount - savings.currentAmount;
        const monthlyRate = savings.monthlyContribution || 0;

        if (monthlyRate > 0) {
          const monthsToComplete = Math.ceil(remaining / monthlyRate);
          const completionDate = new Date();
          completionDate.setMonth(completionDate.getMonth() + monthsToComplete);

          projections.push(
            `💰 "${savings.name}": On track to complete in ${monthsToComplete} months (${completionDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`
          );
        }
      }

      // Project budget runway
      const totalBudget = budgets.reduce((sum, b) => sum + b.totalBudget, 0);
      const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
      const totalRemaining = budgets.reduce((sum, b) => sum + b.remaining, 0);

      if (totalSpent > 0 && totalRemaining > 0) {
        const burnRate = totalSpent / (budgets.length || 1); // Average spend per budget
        projections.push(
          `📊 Budget remaining: $${totalRemaining.toLocaleString()} across ${budgets.length} budget(s)`
        );
      }

      // Project goal completion based on current progress
      const activeGoals = goals.filter(
        (g) => g.status === 'in-progress' && (g.progressPercent || 0) > 0
      );
      for (const goal of activeGoals.slice(0, 3)) {
        const progress = goal.progressPercent || 0;
        if (progress > 0 && progress < 100) {
          // Simple linear projection
          const timeActive = Date.now() - new Date(goal.createdAt).getTime();
          const daysActive = timeActive / (24 * 60 * 60 * 1000);
          const dailyProgress = progress / daysActive;
          const daysRemaining = (100 - progress) / dailyProgress;
          const completionDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);

          projections.push(
            `🎯 "${goal.title}": Projected completion ${completionDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
          );
        }
      }

      if (projections.length === 0) {
        projections.push('📈 Start tracking progress to see trend projections!');
      }

      const result = `📊 **Trend Projections (${months}-month outlook)**\n\n${projections.join('\n\n')}`;

      return { success: true, result, executedBy: 'peter-john' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to project trends');
      return { success: false, error: 'Failed to project trends', executedBy: 'peter-john' };
    }
  },
};

/**
 * Handler: Run proactive insight scan
 * Capability: insights
 */
const runProactiveInsightScanHandler: TeamHandlerDefinition = {
  id: 'runProactiveInsightScan',
  name: 'Run Proactive Insight Scan',
  description: 'Run a comprehensive scan for proactive insights and notifications',
  capability: 'insights',
  additionalCapabilities: ['analysis'],
  tags: ['proactive', 'scan', 'notifications'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const userId = request.userId || 'default';

    try {
      // Combine multiple analysis types
      const synthesizeResult = await synthesizeInsightsHandler.execute(request);
      const anomaliesResult = await spotAnomaliesHandler.execute(request);

      let result = '🔎 **Proactive Insight Scan Complete**\n\n';

      if (synthesizeResult.success) {
        result += `${synthesizeResult.result}\n\n---\n\n`;
      }

      if (anomaliesResult.success) {
        result += anomaliesResult.result;
      }

      getLogger().info({ userId }, 'Proactive insight scan completed');

      return { success: true, result, executedBy: 'peter-john' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to run proactive scan');
      return { success: false, error: 'Failed to run scan', executedBy: 'peter-john' };
    }
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * All research/insight handlers
 */
export const researchHandlers: TeamHandlerDefinition[] = [
  synthesizeInsightsHandler,
  spotAnomaliesHandler,
  findCorrelationsHandler,
  projectTrendsHandler,
  runProactiveInsightScanHandler,
];

/**
 * Register all research handlers for an agent
 */
export function registerResearchHandlers(agentId: AgentId = 'peter-john'): void {
  for (const handler of researchHandlers) {
    registerTeamHandler(handler, agentId);
  }

  getLogger().info(
    { agentId, handlerCount: researchHandlers.length },
    'Research handlers registered'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  synthesizeInsightsHandler,
  spotAnomaliesHandler,
  findCorrelationsHandler,
  projectTrendsHandler,
  runProactiveInsightScanHandler,
};

export default registerResearchHandlers;
