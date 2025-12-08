/**
 * Goal Management System - Jordan's Life Goals Coordination
 *
 * Comprehensive goal management including:
 * - Annual goals and quarterly reviews
 * - Life vision and portfolio dashboard
 * - Goal tracking across all life areas
 * - Integration with Maya (financial goals) and Alex (scheduling)
 *
 * Jordan helps users set, track, and achieve their life goals.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  getLifeDataStore,
  type LifeGoal as StoredGoal,
  type LifePortfolio as StoredPortfolio,
} from '../services/life-data-store.js';
import { sanitizePlainText, parseAmount, isValidAmount } from './validation.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_NOTES_LENGTH = 5000;
const MAX_TARGET_VALUE = 100_000_000; // $100M max for financial goals

function validateGoalTitle(title: unknown): { valid: boolean; sanitized?: string; error?: string } {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Goal title is required' };
  }
  const sanitized = sanitizePlainText(title, MAX_TITLE_LENGTH);
  if (sanitized.length < 2) {
    return { valid: false, error: 'Goal title must be at least 2 characters' };
  }
  return { valid: true, sanitized };
}

function validateGoalDescription(desc: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (!desc) {
    return { valid: true, sanitized: '' };
  }
  if (typeof desc !== 'string') {
    return { valid: false, error: 'Description must be a string' };
  }
  return { valid: true, sanitized: sanitizePlainText(desc, MAX_DESCRIPTION_LENGTH) };
}

function validateTargetValue(value: unknown): {
  valid: boolean;
  sanitized?: number;
  error?: string;
} {
  if (value === undefined || value === null) {
    return { valid: true }; // Optional
  }
  const parsed = parseAmount(value as string | number);
  if (parsed === null || !isValidAmount(parsed, 0, MAX_TARGET_VALUE)) {
    return {
      valid: false,
      error: `Invalid target value: must be between 0 and ${MAX_TARGET_VALUE.toLocaleString()}`,
    };
  }
  return { valid: true, sanitized: parsed };
}

function validateGoalNotes(notes: unknown): { valid: boolean; sanitized?: string; error?: string } {
  if (!notes) {
    return { valid: true, sanitized: '' };
  }
  if (typeof notes !== 'string') {
    return { valid: false, error: 'Notes must be a string' };
  }
  return { valid: true, sanitized: sanitizePlainText(notes, MAX_NOTES_LENGTH) };
}

// ============================================================================
// TYPES
// ============================================================================

export type GoalCategory =
  | 'career' // Work, income, professional growth
  | 'financial' // Savings, debt, investments (coordinate with Maya)
  | 'health' // Fitness, wellness, medical
  | 'relationships' // Family, friends, romance
  | 'personal-growth' // Learning, skills, hobbies
  | 'home' // Living situation, home projects
  | 'travel' // Trips, adventures
  | 'giving' // Charity, volunteering, legacy
  | 'fun'; // Recreation, entertainment, joy

export type GoalTimeframe =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'multi-year'
  | 'life';

export type GoalStatus =
  | 'not-started'
  | 'in-progress'
  | 'on-track'
  | 'at-risk'
  | 'completed'
  | 'abandoned';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: GoalCategory;
  timeframe: GoalTimeframe;

  // Timeline
  startDate: Date;
  targetDate?: Date;
  completedDate?: Date;

  // Progress
  status: GoalStatus;
  progressPercent: number;
  milestones: GoalMilestone[];

  // Metrics
  targetValue?: number;
  currentValue?: number;
  unit?: string; // e.g., "dollars", "pounds", "books"

  // Connections
  parentGoalId?: string; // For breaking down larger goals
  linkedMilestoneId?: string; // Link to a life milestone

  // Notes
  notes: string;
  reflections: GoalReflection[];

  createdAt: Date;
  updatedAt: Date;
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetDate?: Date;
  completed: boolean;
  notes?: string;
}

export interface GoalReflection {
  id: string;
  date: Date;
  type: 'check-in' | 'celebration' | 'obstacle' | 'lesson' | 'pivot';
  content: string;
}

export interface LifePortfolio {
  userId: string;
  categories: Record<GoalCategory, PortfolioCategory>;
  lastReviewDate?: Date;
  nextReviewDate?: Date;
  overallScore: number; // 1-10 life satisfaction
}

export interface PortfolioCategory {
  category: GoalCategory;
  satisfaction: number; // 1-10
  goals: Goal[];
  focus: 'maintain' | 'improve' | 'transform';
  notes?: string;
}

// In-memory storage
const goals = new Map<string, Goal>();
const portfolios = new Map<string, LifePortfolio>();

// ============================================================================
// GOAL TEMPLATES
// ============================================================================

const GOAL_TEMPLATES: Record<GoalCategory, { examples: string[]; questions: string[] }> = {
  career: {
    examples: [
      'Get promoted',
      'Learn new skill',
      'Switch careers',
      'Start side business',
      'Improve work-life balance',
    ],
    questions: [
      'Where do you want to be professionally in 5 years?',
      'What skills would make you more valuable?',
      "What's your ideal workday look like?",
    ],
  },
  financial: {
    examples: [
      'Build emergency fund',
      'Pay off debt',
      'Save for down payment',
      'Increase income',
      'Start investing',
    ],
    questions: [
      'What does financial freedom mean to you?',
      "What's your biggest financial worry?",
      'What would you do with an extra $500/month?',
    ],
  },
  health: {
    examples: [
      'Lose weight',
      'Run a 5K',
      'Sleep better',
      'Eat healthier',
      'Reduce stress',
      'Regular checkups',
    ],
    questions: [
      'How do you want to feel in your body?',
      'What healthy habit would change your life?',
      "What's holding you back from being healthier?",
    ],
  },
  relationships: {
    examples: [
      'Date nights weekly',
      'Call family more',
      'Make new friends',
      'Improve communication',
      'Plan family reunion',
    ],
    questions: [
      'Who do you want to spend more time with?',
      'What relationship needs attention?',
      'How do you want to show up for others?',
    ],
  },
  'personal-growth': {
    examples: [
      'Read 12 books',
      'Learn instrument',
      'Take a course',
      'Start journaling',
      'Practice meditation',
    ],
    questions: [
      'What have you always wanted to learn?',
      'What skill would open new doors?',
      'How do you want to grow as a person?',
    ],
  },
  home: {
    examples: [
      'Declutter house',
      'Renovate kitchen',
      'Start garden',
      'Move to new place',
      'Create home office',
    ],
    questions: [
      'What would make your space feel like home?',
      'What project have you been putting off?',
      'Where do you want to live in 5 years?',
    ],
  },
  travel: {
    examples: [
      'Visit 3 new countries',
      'Road trip across country',
      'Weekend getaways monthly',
      'Visit all national parks',
      'Learn to travel solo',
    ],
    questions: [
      'Where is your dream destination?',
      'What kind of traveler do you want to be?',
      'What experience would create lasting memories?',
    ],
  },
  giving: {
    examples: [
      'Volunteer monthly',
      'Donate to charity',
      'Mentor someone',
      'Organize community event',
      'Start foundation',
    ],
    questions: [
      'What cause matters most to you?',
      'How do you want to make a difference?',
      'What legacy do you want to leave?',
    ],
  },
  fun: {
    examples: [
      'Try 12 new restaurants',
      'Attend concerts',
      'Game night weekly',
      'Take up photography',
      'Join sports league',
    ],
    questions: [
      'What makes you lose track of time?',
      'When do you feel most alive?',
      'What did you love doing as a kid?',
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserGoals(userId: string): Goal[] {
  return Array.from(goals.values()).filter((g) => g.userId === userId);
}

function getGoalsByCategory(userId: string, category: GoalCategory): Goal[] {
  return getUserGoals(userId).filter((g) => g.category === category);
}

function getGoalsByTimeframe(userId: string, timeframe: GoalTimeframe): Goal[] {
  return getUserGoals(userId).filter((g) => g.timeframe === timeframe);
}

function calculateOverallProgress(userGoals: Goal[]): number {
  if (userGoals.length === 0) return 0;
  const totalProgress = userGoals.reduce((sum, g) => sum + g.progressPercent, 0);
  return Math.round(totalProgress / userGoals.length);
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export async function createGoal(
  userId: string,
  title: string,
  category: GoalCategory,
  timeframe: GoalTimeframe,
  targetDate?: Date,
  targetValue?: number,
  unit?: string,
  description?: string
): Promise<Goal> {
  // Validate inputs
  const titleValidation = validateGoalTitle(title);
  if (!titleValidation.valid) {
    throw new Error(titleValidation.error);
  }

  const descValidation = validateGoalDescription(description);
  if (!descValidation.valid) {
    throw new Error(descValidation.error);
  }

  const targetValidation = validateTargetValue(targetValue);
  if (!targetValidation.valid) {
    throw new Error(targetValidation.error);
  }

  const sanitizedTitle = titleValidation.sanitized!;
  const sanitizedDesc = descValidation.sanitized;
  const sanitizedTarget = targetValidation.sanitized;
  const sanitizedUnit = unit ? sanitizePlainText(unit, 50) : undefined;

  const id = generateId('goal');

  const goal: Goal = {
    id,
    userId,
    title: sanitizedTitle,
    description: sanitizedDesc,
    category,
    timeframe,
    startDate: new Date(),
    targetDate,
    status: 'not-started',
    progressPercent: 0,
    milestones: [],
    targetValue: sanitizedTarget,
    currentValue: 0,
    unit: sanitizedUnit,
    notes: '',
    reflections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  goals.set(id, goal);

  // Persist to LifeDataStore
  try {
    const store = getLifeDataStore();
    await store.saveGoal(userId, goal as unknown as StoredGoal);
  } catch (error) {
    getLogger().warn({ error, goalId: id }, 'Failed to persist goal to store');
  }

  getLogger().info({ goalId: id, title, category, timeframe }, '🎯 Goal created');

  return goal;
}

export function updateGoalProgress(
  goalId: string,
  progressPercent?: number,
  currentValue?: number,
  status?: GoalStatus
): Goal | undefined {
  const goal = goals.get(goalId);
  if (!goal) return undefined;

  if (progressPercent !== undefined) goal.progressPercent = Math.min(100, progressPercent);
  if (currentValue !== undefined) goal.currentValue = currentValue;
  if (status) goal.status = status;

  // Auto-calculate progress if we have target/current values
  if (goal.targetValue && goal.currentValue !== undefined) {
    goal.progressPercent = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
  }

  // Auto-update status based on progress
  if (goal.progressPercent === 100 && goal.status !== 'completed') {
    goal.status = 'completed';
    goal.completedDate = new Date();
  } else if (goal.progressPercent > 0 && goal.status === 'not-started') {
    goal.status = 'in-progress';
  }

  goal.updatedAt = new Date();
  goals.set(goalId, goal);

  return goal;
}

export function addGoalMilestone(
  goalId: string,
  title: string,
  targetDate?: Date
): GoalMilestone | undefined {
  const goal = goals.get(goalId);
  if (!goal) return undefined;

  const milestone: GoalMilestone = {
    id: generateId('milestone'),
    title,
    targetDate,
    completed: false,
  };

  goal.milestones.push(milestone);
  goal.updatedAt = new Date();
  goals.set(goalId, goal);

  return milestone;
}

export function addGoalReflection(
  goalId: string,
  type: GoalReflection['type'],
  content: string
): GoalReflection | undefined {
  const goal = goals.get(goalId);
  if (!goal) return undefined;

  const reflection: GoalReflection = {
    id: generateId('reflection'),
    date: new Date(),
    type,
    content,
  };

  goal.reflections.push(reflection);
  goal.updatedAt = new Date();
  goals.set(goalId, goal);

  return reflection;
}

export function getOrCreatePortfolio(userId: string): LifePortfolio {
  let portfolio = portfolios.get(userId);

  if (!portfolio) {
    const categories: GoalCategory[] = [
      'career',
      'financial',
      'health',
      'relationships',
      'personal-growth',
      'home',
      'travel',
      'giving',
      'fun',
    ];

    portfolio = {
      userId,
      categories: {} as Record<GoalCategory, PortfolioCategory>,
      overallScore: 5,
    };

    categories.forEach((cat) => {
      portfolio!.categories[cat] = {
        category: cat,
        satisfaction: 5,
        goals: [],
        focus: 'maintain',
      };
    });

    portfolios.set(userId, portfolio);
  }

  // Update goals in each category
  Object.keys(portfolio.categories).forEach((cat) => {
    portfolio!.categories[cat as GoalCategory].goals = getGoalsByCategory(
      userId,
      cat as GoalCategory
    );
  });

  return portfolio;
}

export function updatePortfolioSatisfaction(
  userId: string,
  category: GoalCategory,
  satisfaction: number,
  focus?: 'maintain' | 'improve' | 'transform'
): LifePortfolio {
  const portfolio = getOrCreatePortfolio(userId);

  portfolio.categories[category].satisfaction = Math.max(1, Math.min(10, satisfaction));
  if (focus) portfolio.categories[category].focus = focus;

  // Recalculate overall score
  const scores = Object.values(portfolio.categories).map((c) => c.satisfaction);
  portfolio.overallScore =
    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  portfolios.set(userId, portfolio);
  return portfolio;
}

// ============================================================================
// CONTEXT ENRICHMENT HELPERS
// Used by simple-utilities to connect dates/timers to life events
// ============================================================================

/**
 * Get all active goals for a user (for context enrichment)
 */
export function getActiveGoals(userId: string): Array<{
  id: string;
  name: string;
  category: GoalCategory;
  targetDate?: Date;
  status: string;
}> {
  const userGoals = Array.from(goals.values()).filter(
    (g) => g.userId === userId && (g.status === 'in-progress' || g.status === 'on-track' || g.status === 'not-started')
  );
  
  return userGoals.map((g) => ({
    id: g.id,
    name: g.title,
    category: g.category,
    targetDate: g.targetDate,
    status: g.status,
  }));
}

/**
 * Get upcoming milestones across all goals (for context enrichment)
 */
export function getUpcomingMilestones(userId: string, withinDays = 90): Array<{
  name: string;
  targetDate: Date;
  goalId: string;
  goalName: string;
  category: GoalCategory;
}> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  const milestones: Array<{
    name: string;
    targetDate: Date;
    goalId: string;
    goalName: string;
    category: GoalCategory;
  }> = [];
  
  const userGoals = Array.from(goals.values()).filter(
    (g) => g.userId === userId && (g.status === 'in-progress' || g.status === 'on-track' || g.status === 'not-started')
  );
  
  for (const goal of userGoals) {
    for (const milestone of goal.milestones) {
      if (milestone.targetDate && !milestone.completed) {
        const date = new Date(milestone.targetDate);
        if (date >= now && date <= cutoff) {
          milestones.push({
            name: milestone.title,
            targetDate: date,
            goalId: goal.id,
            goalName: goal.title,
            category: goal.category,
          });
        }
      }
    }
  }
  
  // Sort by date
  return milestones.sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());
}

/**
 * Find events near a specific date (for "X days from now" enrichment)
 */
export function findEventsNearDate(
  userId: string,
  targetDate: Date,
  windowDays = 7
): Array<{
  name: string;
  date: Date;
  type: 'goal_deadline' | 'milestone';
  daysFromTarget: number;
}> {
  const events: Array<{
    name: string;
    date: Date;
    type: 'goal_deadline' | 'milestone';
    daysFromTarget: number;
  }> = [];
  
  const userGoals = Array.from(goals.values()).filter(
    (g) => g.userId === userId && (g.status === 'in-progress' || g.status === 'on-track' || g.status === 'not-started')
  );
  
  for (const goal of userGoals) {
    // Check goal deadline
    if (goal.targetDate) {
      const daysDiff = Math.round(
        (goal.targetDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (Math.abs(daysDiff) <= windowDays) {
        events.push({
          name: goal.title,
          date: goal.targetDate,
          type: 'goal_deadline',
          daysFromTarget: daysDiff,
        });
      }
    }
    
    // Check milestones
    for (const milestone of goal.milestones) {
      if (milestone.targetDate && !milestone.completed) {
        const milestoneDate = new Date(milestone.targetDate);
        const daysDiff = Math.round(
          (milestoneDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (Math.abs(daysDiff) <= windowDays) {
          events.push({
            name: `${milestone.title} (${goal.title})`,
            date: milestoneDate,
            type: 'milestone',
            daysFromTarget: daysDiff,
          });
        }
      }
    }
  }
  
  return events.sort((a, b) => Math.abs(a.daysFromTarget) - Math.abs(b.daysFromTarget));
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createGoalManagementTools() {
  return {
    // ========== CREATE GOAL ==========
    createGoal: llm.tool({
      description: `Create a new goal in any life category.
Jordan helps set meaningful, achievable goals with clear timelines.`,
      parameters: z.object({
        title: z.string().describe('Clear, specific goal title'),
        category: z
          .enum([
            'career',
            'financial',
            'health',
            'relationships',
            'personal-growth',
            'home',
            'travel',
            'giving',
            'fun',
          ])
          .describe('Life category for this goal'),
        timeframe: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'multi-year', 'life'])
          .describe('Timeframe for achieving this goal'),
        targetDate: z
          .string()
          .optional()
          .describe('Target completion date (e.g., "December 31, 2025")'),
        targetValue: z.number().optional().describe('Numeric target (e.g., 10000 for savings)'),
        unit: z
          .string()
          .optional()
          .describe('Unit for the target (e.g., "dollars", "books", "miles")'),
        description: z.string().optional().describe('Additional details about the goal'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({
        title,
        category,
        timeframe,
        targetDate,
        targetValue,
        unit,
        description,
        userId,
      }) => {
        const parsedDate = targetDate ? new Date(targetDate) : undefined;

        const goal = await createGoal(
          userId,
          title,
          category,
          timeframe,
          parsedDate,
          targetValue,
          unit,
          description
        );

        let response = `🎯 **New Goal Created!**\n\n`;
        response += `**"${title}"**\n`;
        response += `📂 Category: ${category}\n`;
        response += `⏱️ Timeframe: ${timeframe}\n`;
        if (parsedDate) {
          response += `📅 Target: ${parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
        }
        if (targetValue && unit) {
          response += `🎯 Target: ${targetValue.toLocaleString()} ${unit}\n`;
        }

        response += `\n**Tips for "${category}" goals:**\n`;
        GOAL_TEMPLATES[category].questions.slice(0, 2).forEach((q) => {
          response += `• ${q}\n`;
        });

        response += `\nWant to break this down into milestones?`;

        return response;
      },
    }),

    // ========== UPDATE GOAL PROGRESS ==========
    updateGoalProgress: llm.tool({
      description: `Update progress on a goal. Jordan celebrates wins and helps overcome obstacles.`,
      parameters: z.object({
        goalTitle: z.string().describe('Title of the goal to update (partial match)'),
        progressPercent: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('Overall progress percentage'),
        currentValue: z
          .number()
          .optional()
          .describe('Current numeric value (if goal has a target)'),
        status: z
          .enum(['not-started', 'in-progress', 'on-track', 'at-risk', 'completed', 'abandoned'])
          .optional()
          .describe('Current status'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ goalTitle, progressPercent, currentValue, status, userId }) => {
        const userGoals = getUserGoals(userId);
        const goal = userGoals.find((g) => g.title.toLowerCase().includes(goalTitle.toLowerCase()));

        if (!goal) {
          return `Couldn't find a goal matching "${goalTitle}". Your goals:\n${userGoals.map((g) => `• ${g.title}`).join('\n')}`;
        }

        const previousProgress = goal.progressPercent;
        const updated = updateGoalProgress(goal.id, progressPercent, currentValue, status);
        if (!updated) return `Error updating goal.`;

        let response = `📊 **Goal Updated: "${updated.title}"**\n\n`;
        response += `**Progress:** ${updated.progressPercent}%`;
        if (previousProgress !== updated.progressPercent) {
          const change = updated.progressPercent - previousProgress;
          response += ` (${change > 0 ? '+' : ''}${change}%)\n`;
        } else {
          response += '\n';
        }

        if (updated.targetValue && updated.currentValue !== undefined) {
          response += `**Value:** ${updated.currentValue.toLocaleString()} / ${updated.targetValue.toLocaleString()} ${updated.unit || ''}\n`;
        }
        response += `**Status:** ${updated.status}\n`;

        // Celebrations and encouragement
        if (updated.status === 'completed') {
          response += `\n🎉 **GOAL COMPLETED!** Amazing work! This is worth celebrating!\n`;
        } else if (updated.progressPercent >= 75) {
          response += `\n🔥 You're in the home stretch! Keep that momentum!\n`;
        } else if (updated.progressPercent >= 50) {
          response += `\n💪 Halfway there! You've got this!\n`;
        } else if (updated.progressPercent >= 25) {
          response += `\n👍 Making progress! Every step counts!\n`;
        }

        return response;
      },
    }),

    // ========== GET GOALS SUMMARY ==========
    getGoalsSummary: llm.tool({
      description: `Get a summary of all goals, optionally filtered by category or timeframe.`,
      parameters: z.object({
        category: z
          .enum([
            'career',
            'financial',
            'health',
            'relationships',
            'personal-growth',
            'home',
            'travel',
            'giving',
            'fun',
            'all',
          ])
          .optional()
          .default('all')
          .describe('Filter by category'),
        timeframe: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'multi-year', 'life', 'all'])
          .optional()
          .default('all')
          .describe('Filter by timeframe'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ category = 'all', timeframe = 'all', userId }) => {
        let userGoals = getUserGoals(userId);

        if (category !== 'all') {
          userGoals = userGoals.filter((g) => g.category === category);
        }
        if (timeframe !== 'all') {
          userGoals = userGoals.filter((g) => g.timeframe === timeframe);
        }

        if (userGoals.length === 0) {
          return `No goals found${category !== 'all' ? ` in ${category}` : ''}${timeframe !== 'all' ? ` for ${timeframe}` : ''}. Ready to set some?`;
        }

        const overallProgress = calculateOverallProgress(userGoals);
        const completed = userGoals.filter((g) => g.status === 'completed').length;
        const atRisk = userGoals.filter((g) => g.status === 'at-risk').length;

        let response = `📋 **Goals Summary**\n\n`;
        response += `**Total:** ${userGoals.length} goals | **Completed:** ${completed} | **At Risk:** ${atRisk}\n`;
        response += `**Overall Progress:** ${overallProgress}%\n\n`;

        // Group by status
        const statusOrder: GoalStatus[] = [
          'at-risk',
          'in-progress',
          'on-track',
          'not-started',
          'completed',
        ];
        const statusEmoji: Record<GoalStatus, string> = {
          'not-started': '⬜',
          'in-progress': '🟡',
          'on-track': '🟢',
          'at-risk': '🔴',
          completed: '✅',
          abandoned: '⛔',
        };

        statusOrder.forEach((status) => {
          const statusGoals = userGoals.filter((g) => g.status === status);
          if (statusGoals.length > 0) {
            response += `**${status.toUpperCase()}**\n`;
            statusGoals.forEach((g) => {
              response += `${statusEmoji[status]} ${g.title} (${g.progressPercent}%)\n`;
            });
            response += '\n';
          }
        });

        return response;
      },
    }),

    // ========== ADD GOAL MILESTONE ==========
    addGoalMilestone: llm.tool({
      description: `Break down a goal into smaller milestones for better tracking.`,
      parameters: z.object({
        goalTitle: z.string().describe('Title of the goal (partial match)'),
        milestoneTitle: z.string().describe('Title of the milestone'),
        targetDate: z.string().optional().describe('Target date for the milestone'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ goalTitle, milestoneTitle, targetDate, userId }) => {
        const userGoals = getUserGoals(userId);
        const goal = userGoals.find((g) => g.title.toLowerCase().includes(goalTitle.toLowerCase()));

        if (!goal) {
          return `Couldn't find a goal matching "${goalTitle}".`;
        }

        const parsedDate = targetDate ? new Date(targetDate) : undefined;
        const milestone = addGoalMilestone(goal.id, milestoneTitle, parsedDate);

        if (!milestone) return `Error adding milestone.`;

        let response = `✨ **Milestone Added to "${goal.title}"**\n\n`;
        response += `**New Milestone:** ${milestoneTitle}\n`;
        if (parsedDate) {
          response += `**Target:** ${parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
        }
        response += `\n**All Milestones (${goal.milestones.length}):**\n`;
        goal.milestones.forEach((m, i) => {
          response += `${m.completed ? '✅' : '☐'} ${i + 1}. ${m.title}\n`;
        });

        return response;
      },
    }),

    // ========== GET LIFE PORTFOLIO ==========
    getLifePortfolio: llm.tool({
      description: `Get a holistic view of your life across all categories - your personal life dashboard.`,
      parameters: z.object({
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ userId }) => {
        const portfolio = getOrCreatePortfolio(userId);

        let response = `🌟 **Your Life Portfolio**\n\n`;
        response += `**Overall Life Satisfaction:** ${portfolio.overallScore}/10\n\n`;

        const focusEmoji: Record<string, string> = {
          maintain: '🟢',
          improve: '🟡',
          transform: '🔴',
        };

        const sortedCategories = Object.values(portfolio.categories).sort(
          (a, b) => a.satisfaction - b.satisfaction
        );

        sortedCategories.forEach((cat) => {
          const goalCount = cat.goals.length;
          const activeGoals = cat.goals.filter(
            (g) => g.status !== 'completed' && g.status !== 'abandoned'
          ).length;
          const bar = '█'.repeat(cat.satisfaction) + '░'.repeat(10 - cat.satisfaction);

          response += `**${cat.category.toUpperCase()}** ${focusEmoji[cat.focus]}\n`;
          response += `${bar} ${cat.satisfaction}/10\n`;
          response += `Goals: ${activeGoals} active / ${goalCount} total\n\n`;
        });

        response += `---\n`;
        response += `💡 **Focus Areas:** Categories marked 🔴 need transformation\n`;
        response += `Update satisfaction scores with "rate my [category] a [1-10]"`;

        return response;
      },
    }),

    // ========== UPDATE PORTFOLIO SATISFACTION ==========
    updatePortfolioSatisfaction: llm.tool({
      description: `Rate your satisfaction in a life category (1-10) and set your focus level.`,
      parameters: z.object({
        category: z
          .enum([
            'career',
            'financial',
            'health',
            'relationships',
            'personal-growth',
            'home',
            'travel',
            'giving',
            'fun',
          ])
          .describe('Life category to rate'),
        satisfaction: z.number().min(1).max(10).describe('Satisfaction score 1-10'),
        focus: z
          .enum(['maintain', 'improve', 'transform'])
          .optional()
          .describe('Focus level: maintain (happy), improve (some work), transform (major change)'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ category, satisfaction, focus, userId }) => {
        const portfolio = updatePortfolioSatisfaction(userId, category, satisfaction, focus);

        let response = `📊 **${category.toUpperCase()} Updated**\n\n`;
        response += `**Satisfaction:** ${satisfaction}/10\n`;
        if (focus) {
          response += `**Focus:** ${focus}\n`;
        }
        response += `**Overall Life Score:** ${portfolio.overallScore}/10\n\n`;

        if (satisfaction <= 3) {
          response += `This area needs attention. Want to set some goals to transform it?`;
        } else if (satisfaction <= 6) {
          response += `Room for improvement here. What would make it a 10?`;
        } else {
          response += `Great score! What's working well that we can maintain?`;
        }

        return response;
      },
    }),

    // ========== GET GOAL IDEAS ==========
    getGoalIdeas: llm.tool({
      description: `Get goal ideas and prompting questions for a specific life category.`,
      parameters: z.object({
        category: z
          .enum([
            'career',
            'financial',
            'health',
            'relationships',
            'personal-growth',
            'home',
            'travel',
            'giving',
            'fun',
          ])
          .describe('Life category to explore'),
      }),
      execute: async ({ category }) => {
        const templates = GOAL_TEMPLATES[category];

        let response = `💡 **Goal Ideas for ${category.toUpperCase()}**\n\n`;
        response += `**Example Goals:**\n`;
        templates.examples.forEach((ex) => {
          response += `• ${ex}\n`;
        });
        response += `\n**Questions to Consider:**\n`;
        templates.questions.forEach((q) => {
          response += `• ${q}\n`;
        });
        response += `\nWhat resonates with you?`;

        return response;
      },
    }),

    // ========== QUARTERLY REVIEW ==========
    runQuarterlyReview: llm.tool({
      description: `Run a quarterly goal review - celebrate wins, address challenges, and plan ahead.`,
      parameters: z.object({
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ userId }) => {
        const userGoals = getUserGoals(userId);
        const portfolio = getOrCreatePortfolio(userId);

        const completed = userGoals.filter((g) => g.status === 'completed');
        const inProgress = userGoals.filter(
          (g) => g.status === 'in-progress' || g.status === 'on-track'
        );
        const atRisk = userGoals.filter((g) => g.status === 'at-risk');

        let response = `📅 **QUARTERLY REVIEW**\n\n`;

        // Wins
        response += `🎉 **WINS (${completed.length} completed)**\n`;
        if (completed.length > 0) {
          completed.forEach((g) => (response += `✅ ${g.title}\n`));
        } else {
          response += `No completed goals this quarter - that's okay! Progress counts.\n`;
        }
        response += '\n';

        // In Progress
        response += `🔄 **IN PROGRESS (${inProgress.length})**\n`;
        inProgress.forEach((g) => {
          response += `• ${g.title} (${g.progressPercent}%)\n`;
        });
        response += '\n';

        // At Risk
        if (atRisk.length > 0) {
          response += `⚠️ **NEEDS ATTENTION (${atRisk.length})**\n`;
          atRisk.forEach((g) => {
            response += `• ${g.title} (${g.progressPercent}%)\n`;
          });
          response += '\n';
        }

        // Life Portfolio Summary
        const lowCategories = Object.values(portfolio.categories).filter(
          (c) => c.satisfaction <= 5
        );
        if (lowCategories.length > 0) {
          response += `🎯 **FOCUS AREAS**\n`;
          lowCategories.forEach((c) => {
            response += `• ${c.category}: ${c.satisfaction}/10\n`;
          });
          response += '\n';
        }

        response += `---\n`;
        response += `**Questions for Reflection:**\n`;
        response += `1. What am I most proud of this quarter?\n`;
        response += `2. What obstacle kept coming up?\n`;
        response += `3. What do I want to focus on next quarter?\n`;

        return response;
      },
    }),

    // ========== ADD REFLECTION ==========
    addGoalReflection: llm.tool({
      description: `Add a reflection to a goal - celebrate, note an obstacle, or capture a lesson learned.`,
      parameters: z.object({
        goalTitle: z.string().describe('Title of the goal (partial match)'),
        type: z
          .enum(['check-in', 'celebration', 'obstacle', 'lesson', 'pivot'])
          .describe('Type of reflection'),
        content: z.string().describe('Your reflection'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ goalTitle, type, content, userId }) => {
        const userGoals = getUserGoals(userId);
        const goal = userGoals.find((g) => g.title.toLowerCase().includes(goalTitle.toLowerCase()));

        if (!goal) {
          return `Couldn't find a goal matching "${goalTitle}".`;
        }

        const reflection = addGoalReflection(goal.id, type, content);
        if (!reflection) return `Error adding reflection.`;

        const typeEmoji: Record<string, string> = {
          'check-in': '📝',
          celebration: '🎉',
          obstacle: '🚧',
          lesson: '💡',
          pivot: '🔄',
        };

        let response = `${typeEmoji[type]} **Reflection Added to "${goal.title}"**\n\n`;
        response += `**Type:** ${type}\n`;
        response += `**Note:** ${content}\n\n`;
        response += `Total reflections for this goal: ${goal.reflections.length}`;

        return response;
      },
    }),
  };
}

export default createGoalManagementTools;
