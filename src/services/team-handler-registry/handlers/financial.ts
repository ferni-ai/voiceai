/**
 * Financial Team Handlers
 *
 * Example handlers demonstrating the new team handler registry pattern.
 * These handlers provide financial capabilities like savings goals,
 * budgets, and expense tracking.
 *
 * USAGE:
 *   import { registerFinancialHandlers } from './handlers/financial.js';
 *   registerFinancialHandlers('maya');
 */

import { log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolExecutionRequest, ToolExecutionResult, AgentId } from '../../agent-bus.js';
import { teamHandlerRegistry, registerTeamHandler } from '../index.js';
import type { TeamHandlerDefinition, HandlerCapability } from '../types.js';
import { getLifeDataStore, type MilestoneSavingsGoal } from '../../life-data-store.js';

// ============================================================================
// SAVINGS GOALS HANDLERS
// ============================================================================

/**
 * Handler: Create a savings goal
 * Capability: savings-goals
 */
const createSavingsGoalHandler: TeamHandlerDefinition = {
  id: 'createSavingsGoal',
  name: 'Create Savings Goal',
  description: 'Create a new savings goal, optionally linked to a life milestone',
  capability: 'savings-goals',
  tags: ['savings', 'goals', 'financial'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { name, targetAmount, deadline, linkedToMilestone } = request.params as {
      name: string;
      targetAmount: number;
      deadline?: string;
      linkedToMilestone?: boolean;
    };
    const userId = request.userId || 'default';

    // Validate inputs
    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Goal name is required', executedBy: 'maya' };
    }

    if (!targetAmount || targetAmount <= 0) {
      return { success: false, error: 'Target amount must be positive', executedBy: 'maya' };
    }

    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Calculate monthly contribution
    let monthlyContribution = Math.ceil(targetAmount / 12);
    if (deadline) {
      const deadlineDate = new Date(deadline);
      const monthsUntil = Math.max(
        1,
        Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
      );
      monthlyContribution = Math.ceil(targetAmount / monthsUntil);
    }

    const goal: MilestoneSavingsGoal = {
      id,
      userId,
      name: name.trim(),
      targetAmount,
      currentAmount: 0,
      deadline: deadline ? new Date(deadline) : undefined,
      monthlyContribution,
      linkedMilestoneId: linkedToMilestone ? request.context?.milestoneId as string : undefined,
      status: 'active',
      progressPercent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const store = getLifeDataStore();
      await store.saveMilestoneSavingsGoal(userId, goal);

      getLogger().info({ userId, goalId: id, targetAmount }, 'Savings goal created');

      return {
        success: true,
        result: `Created savings goal "${name}" with target $${targetAmount.toLocaleString()}. Monthly contribution: $${monthlyContribution.toLocaleString()}.`,
        executedBy: 'maya',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to create savings goal');
      return {
        success: false,
        error: 'Failed to save goal',
        executedBy: 'maya',
      };
    }
  },
};

/**
 * Handler: Get savings goal progress
 * Capability: savings-goals
 */
const getSavingsProgressHandler: TeamHandlerDefinition = {
  id: 'getSavingsProgress',
  name: 'Get Savings Progress',
  description: 'Get progress on a savings goal',
  capability: 'savings-goals',
  additionalCapabilities: ['financial-status'],
  tags: ['savings', 'progress', 'financial'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { goalId } = request.params as { goalId?: string };
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();
      const goals = await store.getMilestoneSavingsGoals(userId);

      if (goalId) {
        const goal = goals.find((g) => g.id === goalId);
        if (!goal) {
          return { success: false, error: 'Goal not found', executedBy: 'maya' };
        }

        const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
        return {
          success: true,
          result: `${goal.name}: $${goal.currentAmount.toLocaleString()} of $${goal.targetAmount.toLocaleString()} (${progress}%)`,
          executedBy: 'maya',
        };
      }

      // Return all goals
      if (goals.length === 0) {
        return {
          success: true,
          result: 'No savings goals found.',
          executedBy: 'maya',
        };
      }

      const summary = goals
        .map((g) => {
          const progress = Math.round((g.currentAmount / g.targetAmount) * 100);
          return `• ${g.name}: ${progress}% ($${g.currentAmount.toLocaleString()}/$${g.targetAmount.toLocaleString()})`;
        })
        .join('\n');

      return {
        success: true,
        result: `**Savings Goals:**\n${summary}`,
        executedBy: 'maya',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get savings progress');
      return { success: false, error: 'Failed to get savings data', executedBy: 'maya' };
    }
  },
};

// ============================================================================
// BUDGET HANDLERS
// ============================================================================

/**
 * Handler: Create a budget
 * Capability: budgets
 */
const createBudgetHandler: TeamHandlerDefinition = {
  id: 'createBudget',
  name: 'Create Budget',
  description: 'Create a budget for a specific purpose or milestone',
  capability: 'budgets',
  tags: ['budget', 'planning', 'financial'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { name, totalBudget, categories, milestoneId } = request.params as {
      name: string;
      totalBudget: number;
      categories?: { name: string; amount: number }[];
      milestoneId?: string;
    };
    const userId = request.userId || 'default';

    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Budget name is required', executedBy: 'maya' };
    }

    if (!totalBudget || totalBudget <= 0) {
      return { success: false, error: 'Total budget must be positive', executedBy: 'maya' };
    }

    const id = `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Convert categories array to record
    const categoryRecord: Record<string, number> = {};
    if (categories) {
      for (const cat of categories) {
        categoryRecord[cat.name] = cat.amount;
      }
    }

    try {
      const store = getLifeDataStore();
      await store.saveMilestoneBudget(userId, {
        id,
        userId,
        name: name.trim(),
        totalBudget,
        spent: 0,
        remaining: totalBudget,
        categories: categoryRecord,
        linkedMilestoneId: milestoneId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      getLogger().info({ userId, budgetId: id, totalBudget }, 'Budget created');

      return {
        success: true,
        result: `Created budget "${name}" with total $${totalBudget.toLocaleString()}.`,
        executedBy: 'maya',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to create budget');
      return { success: false, error: 'Failed to save budget', executedBy: 'maya' };
    }
  },
};

// ============================================================================
// EXPENSE TRACKING HANDLERS
// ============================================================================

/**
 * Handler: Track an expense
 * Capability: expense-tracking
 */
const trackExpenseHandler: TeamHandlerDefinition = {
  id: 'trackMilestoneExpense',
  name: 'Track Milestone Expense',
  description: 'Track an expense against a milestone budget',
  capability: 'expense-tracking',
  tags: ['expense', 'tracking', 'financial'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { budgetId, amount, description, category } = request.params as {
      budgetId: string;
      amount: number;
      description?: string;
      category?: string;
    };
    const userId = request.userId || 'default';

    if (!budgetId) {
      return { success: false, error: 'Budget ID is required', executedBy: 'maya' };
    }

    if (!amount || amount <= 0) {
      return { success: false, error: 'Amount must be positive', executedBy: 'maya' };
    }

    try {
      const store = getLifeDataStore();
      const budgets = await store.getMilestoneBudgets(userId);
      const budget = budgets.find((b) => b.id === budgetId);

      if (!budget) {
        return { success: false, error: 'Budget not found', executedBy: 'maya' };
      }

      // Update spent amount
      budget.spent = (budget.spent || 0) + amount;
      budget.remaining = budget.totalBudget - budget.spent;
      budget.updatedAt = new Date();

      await store.saveMilestoneBudget(userId, budget);

      const percentSpent = Math.round((budget.spent / budget.totalBudget) * 100);

      getLogger().info({ userId, budgetId, amount, percentSpent }, 'Expense tracked');

      return {
        success: true,
        result: `Tracked $${amount.toLocaleString()} expense. Budget "${budget.name}" is now ${percentSpent}% spent ($${budget.remaining.toLocaleString()} remaining).`,
        executedBy: 'maya',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to track expense');
      return { success: false, error: 'Failed to track expense', executedBy: 'maya' };
    }
  },
};

// ============================================================================
// FINANCIAL STATUS HANDLER
// ============================================================================

/**
 * Handler: Get overall financial status
 * Capability: financial-status
 */
const getFinancialStatusHandler: TeamHandlerDefinition = {
  id: 'getFinancialStatus',
  name: 'Get Financial Status',
  description: 'Get overview of savings goals and budgets',
  capability: 'financial-status',
  tags: ['status', 'overview', 'financial'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();
      const [goals, budgets] = await Promise.all([
        store.getMilestoneSavingsGoals(userId),
        store.getMilestoneBudgets(userId),
      ]);

      let result = '📊 **Financial Status**\n\n';

      // Savings Summary
      if (goals.length > 0) {
        const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
        const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
        const overallProgress = Math.round((totalSaved / totalTarget) * 100);

        result += `**Savings Goals (${goals.length}):** ${overallProgress}% overall\n`;
        result += `Total saved: $${totalSaved.toLocaleString()} of $${totalTarget.toLocaleString()}\n\n`;
      } else {
        result += '**Savings Goals:** None set\n\n';
      }

      // Budget Summary
      if (budgets.length > 0) {
        const totalBudget = budgets.reduce((sum, b) => sum + b.totalBudget, 0);
        const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
        const overallSpent = Math.round((totalSpent / totalBudget) * 100);

        result += `**Budgets (${budgets.length}):** ${overallSpent}% spent\n`;
        result += `Total spent: $${totalSpent.toLocaleString()} of $${totalBudget.toLocaleString()}\n`;
      } else {
        result += '**Budgets:** None set\n';
      }

      return { success: true, result, executedBy: 'maya' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get financial status');
      return { success: false, error: 'Failed to get financial status', executedBy: 'maya' };
    }
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * All financial handlers
 */
export const financialHandlers: TeamHandlerDefinition[] = [
  createSavingsGoalHandler,
  getSavingsProgressHandler,
  createBudgetHandler,
  trackExpenseHandler,
  getFinancialStatusHandler,
];

/**
 * Register all financial handlers for an agent
 */
export function registerFinancialHandlers(agentId: AgentId = 'maya'): void {
  for (const handler of financialHandlers) {
    registerTeamHandler(handler, agentId);
  }

  getLogger().info(
    { agentId, handlerCount: financialHandlers.length },
    'Financial handlers registered'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  createSavingsGoalHandler,
  getSavingsProgressHandler,
  createBudgetHandler,
  trackExpenseHandler,
  getFinancialStatusHandler,
};

export default registerFinancialHandlers;

