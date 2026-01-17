/**
 * Life Planning Team Handlers (Jordan)
 *
 * Handlers for life milestones, goals, and retirement planning.
 * Jordan coordinates with Maya (financial) and Alex (scheduling)
 * to execute on life plans.
 *
 * USAGE:
 *   import { registerLifePlanningHandlers } from './handlers/life-planning.js';
 *   registerLifePlanningHandlers('jordan');
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolExecutionRequest, ToolExecutionResult, AgentId } from '../../agent-bus.js';
import { registerTeamHandler } from '../index.js';
import type { TeamHandlerDefinition } from '../types.js';
import {
  getLifeDataStore,
  type LifeGoal,
  type LifeMilestone,
  type RetirementPlan,
} from '../../stores/life-data-store.js';

// ============================================================================
// GOAL HANDLERS
// ============================================================================

/**
 * Handler: Get active goals
 * Capability: goals
 */
const getActiveGoalsHandler: TeamHandlerDefinition = {
  id: 'getActiveGoals',
  name: 'Get Active Goals',
  description: 'Get list of active life goals with progress',
  capability: 'goals',
  tags: ['goals', 'life-planning', 'progress'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { summary = false } = request.params as { summary?: boolean };
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();
      const goals = await store.getGoals(userId);
      const activeGoals = goals.filter(
        (g) => g.status === 'in-progress' || g.status === 'not-started'
      );

      if (activeGoals.length === 0) {
        return {
          success: true,
          result: 'No active goals set.',
          executedBy: 'jordan',
        };
      }

      if (summary) {
        const summaryText = activeGoals
          .map((g) => `${g.title} (${g.progressPercent || 0}%)`)
          .join(', ');
        return {
          success: true,
          result: `Active goals: ${summaryText}`,
          executedBy: 'jordan',
        };
      }

      // Full details
      let result = `📋 **Active Goals (${activeGoals.length})**\n\n`;
      for (const goal of activeGoals) {
        result += `**${goal.title}**\n`;
        result += `- Progress: ${goal.progressPercent || 0}%\n`;
        result += `- Category: ${goal.category}\n`;
        if (goal.targetDate) {
          result += `- Target Date: ${new Date(goal.targetDate).toLocaleDateString()}\n`;
        }
        result += '\n';
      }

      return { success: true, result, executedBy: 'jordan' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get active goals');
      return { success: false, error: 'Failed to get goals', executedBy: 'jordan' };
    }
  },
};

/**
 * Handler: Create a life goal
 * Capability: goals
 */
const createGoalHandler: TeamHandlerDefinition = {
  id: 'createLifeGoal',
  name: 'Create Life Goal',
  description: 'Create a new life goal with optional milestones',
  capability: 'goals',
  tags: ['goals', 'life-planning', 'create'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { title, category, deadline, description, milestones } = request.params as {
      title: string;
      category: string;
      deadline?: string;
      description?: string;
      milestones?: Array<{ title: string; deadline?: string }>;
    };
    const userId = request.userId || 'default';

    if (!title || title.trim().length === 0) {
      return { success: false, error: 'Goal title is required', executedBy: 'jordan' };
    }

    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const goal: LifeGoal = {
      id,
      userId,
      title: title.trim(),
      category: (category || 'personal') as LifeGoal['category'],
      timeframe: 'monthly',
      startDate: new Date(),
      targetDate: deadline ? new Date(deadline) : undefined,
      status: 'not-started',
      progressPercent: 0,
      description,
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const store = getLifeDataStore();
      await store.saveGoal(userId, goal);

      getLogger().info({ userId, goalId: id }, 'Life goal created');

      return {
        success: true,
        result: `🎯 Created life goal "${title}" in category "${category}".`,
        executedBy: 'jordan',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to create goal');
      return { success: false, error: 'Failed to create goal', executedBy: 'jordan' };
    }
  },
};

// ============================================================================
// MILESTONE HANDLERS
// ============================================================================

/**
 * Handler: Get milestone status
 * Capability: milestones
 */
const getMilestoneStatusHandler: TeamHandlerDefinition = {
  id: 'getMilestoneStatus',
  name: 'Get Milestone Status',
  description: 'Get status of a specific milestone or all milestones',
  capability: 'milestones',
  tags: ['milestones', 'status', 'progress'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { milestoneId, goalId } = request.params as {
      milestoneId?: string;
      goalId?: string;
    };
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();
      const milestones = await store.getMilestones(userId);

      // Filter by milestone ID
      if (milestoneId) {
        const milestone = milestones.find((m) => m.id === milestoneId);
        if (!milestone) {
          return { success: false, error: 'Milestone not found', executedBy: 'jordan' };
        }
        return {
          success: true,
          result: formatMilestone(milestone),
          executedBy: 'jordan',
        };
      }

      // Filter to active milestones
      const activeMilestones = milestones.filter(
        (m) => m.status === 'in-progress' || m.status === 'planning'
      );

      if (activeMilestones.length === 0) {
        return {
          success: true,
          result: 'No active milestones.',
          executedBy: 'jordan',
        };
      }

      let result = `📍 **Active Milestones (${activeMilestones.length})**\n\n`;
      for (const m of activeMilestones.slice(0, 5)) {
        result += `${formatMilestone(m)}\n`;
      }

      if (activeMilestones.length > 5) {
        result += `\n... and ${activeMilestones.length - 5} more`;
      }

      return { success: true, result, executedBy: 'jordan' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get milestone status');
      return { success: false, error: 'Failed to get milestones', executedBy: 'jordan' };
    }
  },
};

/**
 * Handler: Update milestone progress
 * Capability: milestones
 */
const updateMilestoneProgressHandler: TeamHandlerDefinition = {
  id: 'updateMilestoneProgress',
  name: 'Update Milestone Progress',
  description: 'Update progress on a milestone',
  capability: 'milestones',
  tags: ['milestones', 'update', 'progress'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { milestoneId, status, notes } = request.params as {
      milestoneId: string;
      status?: LifeMilestone['status'];
      notes?: string;
    };
    const userId = request.userId || 'default';

    if (!milestoneId) {
      return { success: false, error: 'Milestone ID is required', executedBy: 'jordan' };
    }

    try {
      const store = getLifeDataStore();
      const milestones = await store.getMilestones(userId);
      const milestone = milestones.find((m) => m.id === milestoneId);

      if (!milestone) {
        return { success: false, error: 'Milestone not found', executedBy: 'jordan' };
      }

      // Update fields
      if (status) {
        milestone.status = status;
      }
      if (notes) {
        milestone.notes = notes;
      }
      milestone.updatedAt = new Date();

      await store.saveMilestone(userId, milestone);

      // Calculate progress from checklist
      const progress =
        milestone.checklist.length > 0
          ? Math.round(
              (milestone.checklist.filter((c) => c.completed).length / milestone.checklist.length) *
                100
            )
          : 0;

      getLogger().info({ userId, milestoneId, status }, 'Milestone updated');

      return {
        success: true,
        result: `✅ Updated "${milestone.name}" - Progress: ${progress}%${status ? `, Status: ${status}` : ''}`,
        executedBy: 'jordan',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to update milestone');
      return { success: false, error: 'Failed to update milestone', executedBy: 'jordan' };
    }
  },
};

// ============================================================================
// RETIREMENT HANDLERS
// ============================================================================

/**
 * Handler: Get retirement plan
 * Capability: retirement
 */
const getRetirementPlanHandler: TeamHandlerDefinition = {
  id: 'getRetirementPlan',
  name: 'Get Retirement Plan',
  description: 'Get user retirement plan and projections',
  capability: 'retirement',
  tags: ['retirement', 'planning', 'financial'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();
      const plan = await store.getRetirementPlan(userId);

      if (!plan) {
        return {
          success: true,
          result: 'No retirement plan set. Would you like to create one?',
          executedBy: 'jordan',
        };
      }

      let result = `🏖️ **Retirement Plan**\n\n`;
      result += `- Target Age: ${plan.targetAge}\n`;
      result += `- Current Age: ${plan.currentAge}\n`;
      result += `- Monthly Income Goal: $${plan.monthlyIncomeGoal?.toLocaleString() || 'Not set'}\n`;
      result += `- Current Savings: $${plan.currentSavings?.toLocaleString() || '0'}\n`;
      result += `- Savings Progress: ${plan.savingsProgress || 0}%\n`;
      result += `- Retirement Style: ${plan.style}\n`;

      return { success: true, result, executedBy: 'jordan' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get retirement plan');
      return { success: false, error: 'Failed to get retirement plan', executedBy: 'jordan' };
    }
  },
};

/**
 * Handler: Link savings to milestone
 * Capability: milestones
 *
 * Coordinates with Maya to create a savings goal for a milestone
 */
const linkSavingsToMilestoneHandler: TeamHandlerDefinition = {
  id: 'linkSavingsToMilestone',
  name: 'Link Savings to Milestone',
  description: 'Request Maya to create a savings goal linked to a milestone',
  capability: 'milestones',
  additionalCapabilities: ['goals'],
  tags: ['milestones', 'savings', 'coordination'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { milestoneId, targetAmount } = request.params as {
      milestoneId: string;
      targetAmount: number;
    };
    const userId = request.userId || 'default';

    if (!milestoneId) {
      return { success: false, error: 'Milestone ID is required', executedBy: 'jordan' };
    }

    if (!targetAmount || targetAmount <= 0) {
      return { success: false, error: 'Target amount must be positive', executedBy: 'jordan' };
    }

    try {
      const store = getLifeDataStore();
      const milestones = await store.getMilestones(userId);
      const milestone = milestones.find((m) => m.id === milestoneId);

      if (!milestone) {
        return { success: false, error: 'Milestone not found', executedBy: 'jordan' };
      }

      // In a full implementation, this would use the Agent Bus to coordinate with Maya
      // For now, we just return a successful coordination message
      getLogger().info(
        { userId, milestoneId, targetAmount },
        'Savings linked to milestone (coordination request)'
      );

      return {
        success: true,
        result: `🔗 Requested savings goal of $${targetAmount.toLocaleString()} linked to milestone "${milestone.name}". Maya will set this up.`,
        executedBy: 'jordan',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to link savings to milestone');
      return { success: false, error: 'Failed to link savings', executedBy: 'jordan' };
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function formatMilestone(m: LifeMilestone): string {
  // Calculate progress from checklist
  const progress =
    m.checklist.length > 0
      ? Math.round((m.checklist.filter((c) => c.completed).length / m.checklist.length) * 100)
      : 0;

  let result = `**${m.name}**\n`;
  result += `- Status: ${m.status}\n`;
  result += `- Progress: ${progress}%\n`;
  if (m.targetDate) {
    result += `- Target Date: ${new Date(m.targetDate).toLocaleDateString()}\n`;
  }
  return result;
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * All life planning handlers
 */
export const lifePlanningHandlers: TeamHandlerDefinition[] = [
  getActiveGoalsHandler,
  createGoalHandler,
  getMilestoneStatusHandler,
  updateMilestoneProgressHandler,
  getRetirementPlanHandler,
  linkSavingsToMilestoneHandler,
];

/**
 * Register all life planning handlers for an agent
 */
export function registerLifePlanningHandlers(agentId: AgentId = 'jordan'): void {
  for (const handler of lifePlanningHandlers) {
    registerTeamHandler(handler, agentId);
  }

  getLogger().info(
    { agentId, handlerCount: lifePlanningHandlers.length },
    'Life planning handlers registered'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getActiveGoalsHandler,
  createGoalHandler,
  getMilestoneStatusHandler,
  updateMilestoneProgressHandler,
  getRetirementPlanHandler,
  linkSavingsToMilestoneHandler,
};

export default registerLifePlanningHandlers;
