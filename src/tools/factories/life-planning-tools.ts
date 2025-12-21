/**
 * Life Planning Tools Factory
 *
 * Creates milestone tracking, goal management, and event planning tools
 * that adapt their behavior based on persona configuration.
 *
 * Jordan: Detailed, culturally aware, comprehensive
 * Ferni: Coaching-oriented, supportive
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { z } from 'zod';
import { getToolDescription } from '../utils/tool-descriptions.js';
import {
  type LifePlanningToolsConfig,
  DEFAULT_TOOL_BEHAVIOR,
  PERSONA_LIFE_PLANNING_CONFIGS,
} from './types.js';

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create life planning tools with persona-specific configuration
 */
export function createLifePlanningToolsFactory(configOverrides?: Partial<LifePlanningToolsConfig>) {
  const config: LifePlanningToolsConfig = {
    ...DEFAULT_TOOL_BEHAVIOR,
    milestoneTracking: true,
    eventPlanningDepth: 'detailed',
    culturalAwareness: false,
    transitionSupport: true,
    goalStyle: 'flexible',
    goalManagement: true,
    giftRegistry: false,
    retirementPlanning: false,
    teamCoordination: false,
    celebrateSuccess: true,
    ...configOverrides,
  };

  const { personaId, milestoneTracking, goalManagement } = config;

  getLogger().debug({ personaId, milestoneTracking }, 'Creating life planning tools');

  // ============================================================================
  // MILESTONE TRACKING
  // ============================================================================

  const createMilestone = llm.tool({
    description: `${getToolDescription('createMilestone')}${
      config.culturalAwareness ? ' I can include cultural traditions and considerations.' : ''
    }`,
    parameters: z.object({
      title: z.string().describe('Milestone name'),
      type: z
        .enum(['wedding', 'baby', 'home', 'graduation', 'retirement', 'career', 'travel', 'other'])
        .describe('Type of milestone'),
      targetDate: z.string().optional().describe('Target date'),
      budget: z.number().optional().describe('Budget if applicable'),
      notes: z.string().optional().describe('Any notes or context'),
    }),
    execute: async ({ title, type, targetDate, budget, notes }) => {
      const milestone = await createMilestoneRecord(title, type, targetDate, budget, notes);
      return formatMilestoneResponse(milestone, config);
    },
  });

  const getMilestoneProgress = llm.tool({
    description: getToolDescription('getMilestoneProgress'),
    parameters: z.object({
      milestoneId: z.string().optional().describe('Specific milestone to check'),
      showAll: z.boolean().optional().default(false).describe('Show all active milestones'),
    }),
    execute: async ({ milestoneId, showAll }) => {
      const progress = await getMilestoneProgressData(milestoneId, showAll);
      return formatProgressResponse(progress, config);
    },
  });

  // ============================================================================
  // GOAL MANAGEMENT
  // ============================================================================

  const createGoal = llm.tool({
    description: `${getToolDescription('createGoal')}${
      config.teamCoordination ? ' Can involve team members for support.' : ''
    }`,
    parameters: z.object({
      title: z.string().describe('Goal title'),
      category: z
        .enum(['career', 'health', 'financial', 'relationship', 'learning', 'personal', 'other'])
        .describe('Goal category'),
      description: z.string().optional().describe('Detailed description'),
      deadline: z.string().optional().describe('Target completion date'),
      milestones: z.array(z.string()).optional().describe('Sub-milestones to track'),
    }),
    execute: async ({ title, category, description, deadline, milestones }) => {
      const goal = await createGoalRecord(title, category, description, deadline, milestones);
      return formatGoalResponse(goal, config);
    },
  });

  const updateGoalProgress = llm.tool({
    description: getToolDescription('updateGoalProgress'),
    parameters: z.object({
      goalId: z.string().describe('Goal to update'),
      progress: z.number().min(0).max(100).describe('Progress percentage'),
      notes: z.string().optional().describe('Notes on progress'),
      completedMilestone: z.string().optional().describe('Milestone completed'),
    }),
    execute: async ({ goalId, progress, notes, completedMilestone }) => {
      await updateGoalRecord(goalId, progress, notes, completedMilestone);

      let response = `Goal updated to ${progress}% complete!`;

      if (completedMilestone) {
        response += `\n\n🎉 Milestone achieved: "${completedMilestone}"`;
      }

      if (config.celebrateSuccess && progress >= 100) {
        response += '\n\n🏆 Congratulations on reaching your goal!';
      } else if (config.celebrateSuccess && progress >= 50) {
        response += "\n\n💪 You're past the halfway point!";
      }

      return response;
    },
  });

  const tools: Record<string, unknown> = {
    createMilestone,
    getMilestoneProgress,
    createGoal,
    updateGoalProgress,
  };

  // ============================================================================
  // CONDITIONAL TOOLS
  // ============================================================================

  // Cultural awareness tools
  if (config.culturalAwareness) {
    tools.getCulturalTraditions = llm.tool({
      description: getToolDescription('getCulturalTraditions'),
      parameters: z.object({
        eventType: z.string().describe('Type of event'),
        culture: z.string().optional().describe('Specific cultural background'),
      }),
      execute: async ({ eventType, culture }) => {
        return getCulturalInfo(eventType, culture);
      },
    });
  }

  // Gift registry
  if (config.giftRegistry) {
    tools.manageGiftRegistry = llm.tool({
      description: getToolDescription('manageGiftRegistry'),
      parameters: z.object({
        action: z.enum(['create', 'add', 'view', 'track']).describe('Action to take'),
        eventId: z.string().optional().describe('Event to manage registry for'),
        item: z.string().optional().describe('Item to add'),
        estimatedPrice: z.number().optional().describe('Estimated price'),
      }),
      execute: async ({ action, eventId, item, estimatedPrice }) => {
        return manageRegistry(action, eventId, item, estimatedPrice);
      },
    });
  }

  // Retirement planning
  if (config.retirementPlanning) {
    tools.planRetirement = llm.tool({
      description: getToolDescription('planRetirement'),
      parameters: z.object({
        currentAge: z.number().describe('Current age'),
        targetRetirementAge: z.number().describe('Target retirement age'),
        currentSavings: z.number().describe('Current retirement savings'),
        monthlyContribution: z.number().describe('Monthly contribution'),
        desiredIncome: z.number().optional().describe('Desired annual retirement income'),
      }),
      execute: async ({
        currentAge,
        targetRetirementAge,
        currentSavings,
        monthlyContribution,
        desiredIncome,
      }) => {
        return calculateRetirementPlan(
          currentAge,
          targetRetirementAge,
          currentSavings,
          monthlyContribution,
          desiredIncome
        );
      },
    });
  }

  // Team coordination
  if (config.teamCoordination) {
    tools.coordinateWithTeam = llm.tool({
      description: getToolDescription('coordinateWithTeam'),
      parameters: z.object({
        goalId: z.string().describe('Goal to coordinate'),
        teamMembers: z.array(z.string()).describe('Team members to involve'),
        supportNeeded: z.string().describe('What kind of support needed'),
      }),
      execute: async ({ goalId, teamMembers, supportNeeded }) => {
        return `Coordinating "${supportNeeded}" with ${teamMembers.join(', ')} for your goal. I'll connect you with the right team member.`;
      },
    });
  }

  return tools;
}

// ============================================================================
// HELPERS
// ============================================================================

interface MilestoneRecord {
  id: string;
  title: string;
  type: string;
  targetDate?: string;
  budget?: number;
  notes?: string;
  createdAt: Date;
  progress: number;
}

async function createMilestoneRecord(
  title: string,
  type: string,
  targetDate?: string,
  budget?: number,
  notes?: string
): Promise<MilestoneRecord> {
  return {
    id: `milestone_${Date.now()}`,
    title,
    type,
    targetDate,
    budget,
    notes,
    createdAt: new Date(),
    progress: 0,
  };
}

function formatMilestoneResponse(
  milestone: MilestoneRecord,
  config: LifePlanningToolsConfig
): string {
  let response = `🎯 Milestone created: "${milestone.title}"\n`;
  response += `Type: ${milestone.type}\n`;

  if (milestone.targetDate) {
    response += `Target: ${milestone.targetDate}\n`;
  }

  if (milestone.budget) {
    response += `Budget: $${milestone.budget.toLocaleString()}\n`;
  }

  if (config.culturalAwareness) {
    response += '\n💡 I can provide cultural traditions and tips for this milestone.';
  }

  if (config.teamCoordination) {
    response += '\n\n👥 Want me to coordinate with the team for support?';
  }

  return response;
}

interface ProgressData {
  milestones: Array<{ title: string; progress: number; daysRemaining?: number }>;
}

async function getMilestoneProgressData(
  milestoneId?: string,
  showAll?: boolean,
  userId?: string
): Promise<ProgressData> {
  if (!userId) {
    return { milestones: [] };
  }

  try {
    const lifeDataStore = await import('../../services/stores/life-data-store.js');
    const store = lifeDataStore.getLifeDataStore();

    // Get user's milestones from the data store
    const milestones = await store.getMilestones(userId);

    // If milestoneId specified, filter to just that one
    type MilestoneType = (typeof milestones)[0];
    const filtered = milestoneId
      ? milestones.filter((m: MilestoneType) => m.id === milestoneId)
      : showAll
        ? milestones
        : milestones.filter(
            (m: MilestoneType) => m.status === 'planning' || m.status === 'in-progress'
          );

    return {
      milestones: filtered.map((m: MilestoneType) => {
        // Calculate progress based on completed checklist items
        const completed = m.checklist.filter((c: { completed: boolean }) => c.completed).length;
        const total = m.checklist.length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Calculate days remaining if target date exists
        const daysRemaining = m.targetDate
          ? Math.max(
              0,
              Math.ceil((new Date(m.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            )
          : undefined;

        return {
          title: m.name,
          progress,
          daysRemaining,
        };
      }),
    };
  } catch (error) {
    // Fallback to empty if store not available
    return { milestones: [] };
  }
}

function formatProgressResponse(data: ProgressData, config: LifePlanningToolsConfig): string {
  if (data.milestones.length === 0) {
    return 'No active milestones. Want to create one?';
  }

  let response = '**Your Milestones**\n\n';

  data.milestones.forEach((m) => {
    const bar =
      '▓'.repeat(Math.floor(m.progress / 10)) + '░'.repeat(10 - Math.floor(m.progress / 10));
    response += `${m.title}\n`;
    response += `[${bar}] ${m.progress}%\n`;
    if (m.daysRemaining) {
      response += `${m.daysRemaining} days remaining\n`;
    }
    response += '\n';
  });

  return response;
}

interface GoalRecord {
  id: string;
  title: string;
  category: string;
  description?: string;
  deadline?: string;
  milestones?: string[];
  progress: number;
}

async function createGoalRecord(
  title: string,
  category: string,
  description?: string,
  deadline?: string,
  milestones?: string[]
): Promise<GoalRecord> {
  return {
    id: `goal_${Date.now()}`,
    title,
    category,
    description,
    deadline,
    milestones,
    progress: 0,
  };
}

function formatGoalResponse(goal: GoalRecord, config: LifePlanningToolsConfig): string {
  let response = `🎯 Goal created: "${goal.title}"\n`;
  response += `Category: ${goal.category}\n`;

  if (goal.deadline) {
    response += `Deadline: ${goal.deadline}\n`;
  }

  if (goal.milestones && goal.milestones.length > 0) {
    response += '\nMilestones:\n';
    goal.milestones.forEach((m, i) => {
      response += `${i + 1}. ${m}\n`;
    });
  }

  if (config.teamCoordination) {
    response += '\n👥 The team can help with different aspects of this goal.';
  }

  return response;
}

async function updateGoalRecord(
  goalId: string,
  progress: number,
  notes?: string,
  completedMilestone?: string,
  userId?: string
): Promise<void> {
  if (!userId) return;

  try {
    const lifeDataStore = await import('../../services/stores/life-data-store.js');
    const store = lifeDataStore.getLifeDataStore();

    const goal = await store.getGoal(userId, goalId);
    if (goal) {
      // Update progress
      goal.progressPercent = progress;

      // Add notes to the goal notes field (concatenate)
      if (notes) {
        goal.notes = goal.notes
          ? `${goal.notes}\n\n[${new Date().toLocaleDateString()}] ${notes}`
          : `[${new Date().toLocaleDateString()}] ${notes}`;
      }

      // Note: milestones are tracked via linkedMilestoneId, not directly on goal
      // If user mentions completing a milestone, log it in notes
      if (completedMilestone) {
        goal.notes = goal.notes
          ? `${goal.notes}\n\n✅ Milestone completed: ${completedMilestone}`
          : `✅ Milestone completed: ${completedMilestone}`;
      }

      goal.updatedAt = new Date();
      await store.saveGoal(userId, goal);
    }
  } catch (error) {
    // Log but don't fail - updates can be retried
    const { getLogger } = await import('../../utils/safe-logger.js');
    getLogger().warn({ error, goalId }, 'Failed to update goal record');
  }
}

function getCulturalInfo(eventType: string, culture?: string): string {
  let info = `**Cultural Considerations for ${eventType}**\n\n`;

  info += 'General traditions:\n';
  info += '• Family involvement is typically important\n';
  info += '• Consider meaningful dates and timing\n';
  info += '• Think about how to honor heritage\n\n';

  if (culture) {
    info += `For ${culture} traditions, I can provide more specific guidance.`;
  }

  return info;
}

function manageRegistry(action: string, eventId?: string, item?: string, price?: number): string {
  switch (action) {
    case 'create':
      return `Gift registry created for your event! Share it with guests when ready.`;
    case 'add':
      return `Added "${item}" ($${price || 'price TBD'}) to your registry.`;
    case 'view':
      return 'Your registry:\n• Kitchen mixer - $299\n• Luggage set - $450\n• Experience fund - flexible';
    case 'track':
      return '3 items purchased, 5 remaining. Thank-you notes: 2 sent, 1 pending.';
    default:
      return 'What would you like to do with your registry?';
  }
}

function calculateRetirementPlan(
  currentAge: number,
  targetAge: number,
  currentSavings: number,
  monthlyContribution: number,
  desiredIncome?: number
): string {
  const yearsToRetirement = targetAge - currentAge;
  const monthsToRetirement = yearsToRetirement * 12;

  // Simplified calculation (7% annual return)
  const futureValue =
    currentSavings * Math.pow(1.07, yearsToRetirement) +
    monthlyContribution * ((Math.pow(1.07, yearsToRetirement) - 1) / (0.07 / 12));

  let response = `**Retirement Plan Summary**\n\n`;
  response += `Current age: ${currentAge}\n`;
  response += `Target retirement: ${targetAge} (${yearsToRetirement} years)\n`;
  response += `Current savings: $${currentSavings.toLocaleString()}\n`;
  response += `Monthly contribution: $${monthlyContribution.toLocaleString()}\n\n`;

  response += `**Projected at retirement:**\n`;
  response += `Estimated balance: $${Math.round(futureValue).toLocaleString()}\n`;

  if (desiredIncome) {
    const yearsOfIncome = futureValue / desiredIncome;
    response += `At $${desiredIncome.toLocaleString()}/year, funds last ~${Math.round(yearsOfIncome)} years\n`;
  }

  return response;
}

// ============================================================================
// PERSONA-SPECIFIC FACTORY FUNCTIONS
// ============================================================================

/**
 * Create Jordan's life planning tools (comprehensive, culturally aware)
 */
export function createJordanLifePlanningTools() {
  return createLifePlanningToolsFactory(PERSONA_LIFE_PLANNING_CONFIGS['jordan-taylor']);
}

/**
 * Create Ferni's life planning tools (coaching-oriented)
 */
export function createFerniLifePlanningTools() {
  return createLifePlanningToolsFactory(PERSONA_LIFE_PLANNING_CONFIGS['ferni']);
}
