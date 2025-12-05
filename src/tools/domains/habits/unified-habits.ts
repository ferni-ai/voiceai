/**
 * Unified Habit System
 *
 * Consolidates habit tracking and habit coaching into a single coherent system.
 * This replaces the separate habits.ts and habit-coaching.ts files.
 *
 * CAPABILITIES:
 * - Basic habit tracking (add, log, stats)
 * - Advanced coaching (Four Tendencies, behavioral science)
 * - Gamification integration (via gamification-v2)
 * - Life domain organization
 * - Challenge system
 * - Progress visualization
 *
 * ARCHITECTURE:
 * - Uses ProductivityStore for persistence
 * - Integrates with gamification-v2 for XP/badges
 * - Leverages tool orchestration for conversation flow
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import {
  getUserId,
  generateId,
  formatDate,
  progressBar,
  ordinal,
} from '../../utils/tool-helpers.js';
import {
  getProductivityStore,
  type HabitData,
  type HabitLogData,
} from '../../../services/productivity-store.js';

// ============================================================================
// TYPES
// ============================================================================

export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
export type HabitCategory =
  | 'health'
  | 'fitness'
  | 'mindfulness'
  | 'productivity'
  | 'learning'
  | 'social'
  | 'finance'
  | 'other';
export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';

export interface EnhancedHabit {
  id: string;
  name: string;
  description?: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  customDays?: number[];
  targetPerDay: number;
  reminderTime?: string;
  isActive: boolean;

  // Advanced coaching fields
  cue?: string; // What triggers this habit
  reward?: string; // What reward follows
  stackedWith?: string; // Habit it's stacked with
  minimumVersion?: string; // 2-minute version
  level: number; // 1-5 mastery level

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// LIFE DOMAINS (from habit-coaching.ts)
// ============================================================================

export const LIFE_DOMAINS = {
  health: {
    name: 'Health & Energy',
    emoji: '💪',
    description: 'Physical health, sleep, nutrition, movement',
    starterHabits: ['drink water', 'take a walk', 'stretch', 'eat vegetables'],
  },
  mind: {
    name: 'Mind & Learning',
    emoji: '🧠',
    description: 'Mental clarity, learning, creativity',
    starterHabits: ['read 10 minutes', 'learn something new', 'journal', 'meditate'],
  },
  relationships: {
    name: 'Relationships',
    emoji: '❤️',
    description: 'Connection with others',
    starterHabits: ['call a friend', 'express gratitude', 'quality time', 'random kindness'],
  },
  work: {
    name: 'Work & Career',
    emoji: '💼',
    description: 'Professional growth and productivity',
    starterHabits: ['plan your day', 'deep work block', 'clear inbox', 'skill practice'],
  },
  money: {
    name: 'Money & Finance',
    emoji: '💰',
    description: 'Financial health and security',
    starterHabits: ['check accounts', 'no-spend challenge', 'save something', 'track spending'],
  },
  spirit: {
    name: 'Spirit & Purpose',
    emoji: '✨',
    description: 'Meaning, values, inner peace',
    starterHabits: ['gratitude practice', 'meditation', 'reflect on values', 'help someone'],
  },
} as const;

// ============================================================================
// FOUR TENDENCIES STRATEGIES
// ============================================================================

export const TENDENCY_STRATEGIES: Record<
  FourTendency,
  {
    description: string;
    strengths: string[];
    challenges: string[];
    strategies: string[];
  }
> = {
  upholder: {
    description: 'Meets both outer and inner expectations readily',
    strengths: ['Self-disciplined', 'Reliable', 'Follows through'],
    challenges: ['Can be rigid', 'May neglect relationships for habits'],
    strategies: [
      'Set clear rules and schedules',
      'Use if-then planning',
      'Balance flexibility with structure',
    ],
  },
  questioner: {
    description: 'Meets inner expectations, questions outer expectations',
    strengths: ['Research-driven', 'Efficient', "Won't do pointless things"],
    challenges: ['Analysis paralysis', 'May reject arbitrary rules'],
    strategies: [
      'Explain WHY the habit matters',
      'Provide evidence and data',
      'Allow customization',
    ],
  },
  obliger: {
    description: 'Meets outer expectations, struggles with inner expectations',
    strengths: ['Responsive', 'Team player', 'Helpful'],
    challenges: ['Needs external accountability', 'May burn out'],
    strategies: [
      'Create external accountability',
      'Join groups or get a partner',
      'Make commitments to others',
    ],
  },
  rebel: {
    description: 'Resists all expectations, inner and outer',
    strengths: ['Authentic', 'Creative', 'Values freedom'],
    challenges: ['Resists being told what to do', 'May resist own goals'],
    strategies: [
      'Focus on identity, not behavior',
      'Emphasize choice and freedom',
      'Connect to values, not rules',
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function shouldTrackOnDay(habit: EnhancedHabit | HabitData, date: Date): boolean {
  const dayOfWeek = date.getDay();
  const frequency = habit.frequency as HabitFrequency;

  switch (frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly':
      return dayOfWeek === new Date(habit.createdAt).getDay();
    case 'custom':
      return (habit.customDays || []).includes(dayOfWeek);
    default:
      return true;
  }
}

function calculateStreak(habitId: string, logs: HabitLogData[]): number {
  const habitLogs = logs
    .filter((l) => l.habitId === habitId && l.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (habitLogs.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 90; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    checkDate.setHours(0, 0, 0, 0);

    const hasLog = habitLogs.some((l) => {
      const logDate = new Date(l.date);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === checkDate.getTime();
    });

    if (hasLog) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return streak;
}

function getCompletionRate(habitId: string, logs: HabitLogData[], days = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const relevantLogs = logs.filter((l) => l.habitId === habitId && new Date(l.date) >= cutoff);

  const completedDays = relevantLogs.filter((l) => l.completed).length;
  return days > 0 ? Math.round((completedDays / days) * 100) : 0;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const addHabitDef: ToolDefinition = {
  id: 'addHabit',
  name: 'Add Habit',
  description: 'Create a new habit to track',
  domain: 'habits',
  tags: ['habit', 'tracking', 'create'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Create a new habit to track.
Use when user wants to:
- Start tracking a habit
- Build a new routine
- Work on consistency`,
      parameters: z.object({
        name: z.string().describe('Habit name (e.g., "Drink 8 glasses of water")'),
        category: z
          .enum([
            'health',
            'fitness',
            'mindfulness',
            'productivity',
            'learning',
            'social',
            'finance',
            'other',
          ])
          .optional()
          .default('other'),
        frequency: z.enum(['daily', 'weekdays', 'weekends', 'weekly']).optional().default('daily'),
        targetPerDay: z.number().optional().default(1).describe('Times per day to complete'),
        cue: z
          .string()
          .optional()
          .describe('What triggers this habit? (e.g., "After morning coffee")'),
        minimumVersion: z.string().optional().describe('2-minute version when motivation is low'),
      }),
      execute: async (
        { name, category, frequency, targetPerDay, cue, minimumVersion },
        { ctx: toolCtx }
      ) => {
        const userId = getUserId({ ctx: toolCtx });
        const store = getProductivityStore();
        await store.loadUserData(userId);

        const habitData: HabitData = {
          id: generateId('habit'),
          name,
          description: cue ? `Cue: ${cue}` : undefined,
          category: category || 'other',
          frequency: frequency || 'daily',
          targetPerDay: targetPerDay || 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        store.setHabit(userId, habitData);
        getLogger().info({ habitId: habitData.id, name }, '✨ Habit created');

        let response = `✨ New habit: "${name}"\n`;
        response += `📅 Frequency: ${frequency}\n`;
        if (targetPerDay && targetPerDay > 1) {
          response += `🎯 Target: ${targetPerDay}x per day\n`;
        }
        if (cue) {
          response += `⚡ Cue: ${cue}\n`;
        }
        if (minimumVersion) {
          response += `🔥 Minimum version: ${minimumVersion}\n`;
        }

        const userHabits = store.getUserHabits(userId);
        response += `\nYou're now tracking ${userHabits.length} habit${userHabits.length !== 1 ? 's' : ''}. Let's build that streak! 🔥`;

        return response;
      },
    });
  },
};

export const logHabitDef: ToolDefinition = {
  id: 'logHabit',
  name: 'Log Habit',
  description: 'Mark a habit as done for today',
  domain: 'habits',
  tags: ['habit', 'tracking', 'complete'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Mark a habit as done for today.
Use when user says they did something or completed a habit.`,
      parameters: z.object({
        habitName: z.string().describe('Which habit to log'),
        count: z.number().optional().describe('How many times (for multi-count habits)'),
        notes: z.string().optional().describe('Any notes'),
      }),
      execute: async ({ habitName, count, notes }, { ctx: toolCtx }) => {
        const userId = getUserId({ ctx: toolCtx });
        const store = getProductivityStore();
        await store.loadUserData(userId);

        const userHabits = store.getUserHabits(userId);
        const habit = userHabits.find((h) =>
          h.name.toLowerCase().includes(habitName.toLowerCase())
        );

        if (!habit) {
          return `I couldn't find a habit matching "${habitName}". Your habits:\n${userHabits.map((h) => `• ${h.name}`).join('\n') || 'None yet!'}`;
        }

        const logData: HabitLogData = {
          id: generateId('log'),
          habitId: habit.id,
          date: new Date().toISOString(),
          completed: true,
          count: count || 1,
          notes,
        };

        store.setHabitLog(userId, logData);

        const logs = store.getUserHabitLogs(userId);
        const streak = calculateStreak(habit.id, logs);

        let response = `✅ "${habit.name}" done!`;
        if (streak > 0) {
          response += ` 🔥 ${streak} day streak!`;
        }

        // Celebrate milestones
        if ([7, 14, 21, 30, 66, 100].includes(streak)) {
          response += `\n\n🎉 MILESTONE! ${streak} days is incredible!`;
          if (streak === 21) {
            response += ' Research says habits start forming around 21 days!';
          } else if (streak === 66) {
            response += ' 66 days is when habits become automatic!';
          }
        }

        return response;
      },
    });
  },
};

export const getHabitStatsDef: ToolDefinition = {
  id: 'getHabitStats',
  name: 'Get Habit Stats',
  description: 'Show habit statistics and streaks',
  domain: 'habits',
  tags: ['habit', 'stats', 'progress'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Show habit statistics and streaks.
Use when user asks about progress or streaks.`,
      parameters: z.object({
        habitName: z.string().optional().describe('Specific habit to check'),
      }),
      execute: async ({ habitName }, { ctx: toolCtx }) => {
        const userId = getUserId({ ctx: toolCtx });
        const store = getProductivityStore();
        await store.loadUserData(userId);

        const userHabits = store.getUserHabits(userId).filter((h) => h.isActive);
        const logs = store.getUserHabitLogs(userId);

        if (userHabits.length === 0) {
          return `No habits tracked yet. Want to start one?`;
        }

        if (habitName) {
          const habit = userHabits.find((h) =>
            h.name.toLowerCase().includes(habitName.toLowerCase())
          );

          if (!habit) {
            return `Couldn't find "${habitName}".`;
          }

          const streak = calculateStreak(habit.id, logs);
          const rate30 = getCompletionRate(habit.id, logs, 30);
          const rate7 = getCompletionRate(habit.id, logs, 7);

          let response = `📊 **${habit.name}**\n\n`;
          response += `🔥 Current Streak: ${streak} day${streak !== 1 ? 's' : ''}\n`;
          response += `📅 Last 7 days: ${rate7}%\n`;
          response += `📆 Last 30 days: ${rate30}%\n\n`;
          response += `This week: ${progressBar(rate7, 10)} ${rate7}%`;

          return response;
        }

        // Show all habits
        let response = `📊 **Habit Dashboard**\n\n`;

        let totalStreak = 0;
        for (const habit of userHabits) {
          const streak = calculateStreak(habit.id, logs);
          const rate = getCompletionRate(habit.id, logs, 7);
          totalStreak += streak;

          response += `**${habit.name}**\n`;
          response += `  🔥 ${streak} days | ${progressBar(rate, 10)} ${rate}%\n\n`;
        }

        response += `---\nCombined streak power: 🔥 ${totalStreak}`;

        return response;
      },
    });
  },
};

export const getDueHabitsDef: ToolDefinition = {
  id: 'getDueHabits',
  name: 'Get Due Habits',
  description: 'Show which habits still need to be done today',
  domain: 'habits',
  tags: ['habit', 'due', 'today'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Show which habits still need to be done today.
Use when user asks "what habits do I need to do?" or checks in.`,
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userId = getUserId({ ctx: toolCtx });
        const store = getProductivityStore();
        await store.loadUserData(userId);

        const userHabits = store.getUserHabits(userId).filter((h) => h.isActive);
        const logs = store.getUserHabitLogs(userId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueHabits = userHabits.filter((habit) => {
          if (!shouldTrackOnDay(habit, today)) return false;

          // Check if completed today
          const todayLog = logs.find((l) => {
            const logDate = new Date(l.date);
            logDate.setHours(0, 0, 0, 0);
            return l.habitId === habit.id && logDate.getTime() === today.getTime() && l.completed;
          });

          return !todayLog;
        });

        const completed = userHabits.length - dueHabits.length;

        if (dueHabits.length === 0) {
          if (userHabits.length === 0) {
            return `You don't have any habits set up yet. Want to start tracking one?`;
          }
          return `🎉 All ${userHabits.length} habit${userHabits.length > 1 ? 's' : ''} done for today! Excellent work!`;
        }

        let response = `📋 **Today's Habits** (${completed}/${userHabits.length} done)\n\n`;

        for (const habit of dueHabits) {
          const streak = calculateStreak(habit.id, logs);
          const streakStr = streak > 0 ? ` 🔥${streak}` : '';
          response += `☐ ${habit.name}${streakStr}\n`;
        }

        if (completed > 0) {
          response += `\n✅ Completed: ${completed}`;
        }

        return response;
      },
    });
  },
};

export const getTendencyAdviceDef: ToolDefinition = {
  id: 'getTendencyAdvice',
  name: 'Get Tendency Advice',
  description: 'Get habit advice based on Four Tendencies personality framework',
  domain: 'habits',
  tags: ['habit', 'coaching', 'tendencies'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get habit advice based on the Four Tendencies framework.
Use when user is struggling with habits or needs personalized strategies.`,
      parameters: z.object({
        tendency: z
          .enum(['upholder', 'questioner', 'obliger', 'rebel'])
          .describe("The user's tendency type"),
        challenge: z.string().optional().describe("What habit challenge they're facing"),
      }),
      execute: async ({ tendency, challenge }) => {
        const info = TENDENCY_STRATEGIES[tendency];

        let response = `🎯 **${tendency.charAt(0).toUpperCase() + tendency.slice(1)} Strategies**\n\n`;
        response += `${info.description}\n\n`;
        response += `**Your Strengths:**\n${info.strengths.map((s) => `• ${s}`).join('\n')}\n\n`;
        response += `**Watch Out For:**\n${info.challenges.map((c) => `• ${c}`).join('\n')}\n\n`;
        response += `**Strategies That Work:**\n${info.strategies.map((s) => `• ${s}`).join('\n')}`;

        if (challenge) {
          response += `\n\n**For your challenge ("${challenge}"):**\n`;
          switch (tendency) {
            case 'upholder':
              response += "Set a clear rule and schedule. You'll follow through.";
              break;
            case 'questioner':
              response += "Research why this habit matters. Once convinced, you'll commit.";
              break;
            case 'obliger':
              response += 'Find an accountability partner or make a commitment to someone else.';
              break;
            case 'rebel':
              response +=
                'Focus on who you want to BE, not what you should DO. Make it your choice.';
              break;
          }
        }

        return response;
      },
    });
  },
};

export const getLifeDomainsDef: ToolDefinition = {
  id: 'getLifeDomains',
  name: 'Get Life Domains',
  description: 'Show life domains for organizing habits',
  domain: 'habits',
  tags: ['habit', 'domains', 'organization'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Show life domains for organizing habits.
Use when user wants to explore different areas for improvement.`,
      parameters: z.object({
        domain: z.enum(['health', 'mind', 'relationships', 'work', 'money', 'spirit']).optional(),
      }),
      execute: async ({ domain }) => {
        if (domain) {
          const info = LIFE_DOMAINS[domain];
          let response = `${info.emoji} **${info.name}**\n\n`;
          response += `${info.description}\n\n`;
          response += `**Starter Habits:**\n${info.starterHabits.map((h) => `• ${h}`).join('\n')}`;
          return response;
        }

        let response = `🌟 **Life Domains for Balanced Growth**\n\n`;
        for (const [key, info] of Object.entries(LIFE_DOMAINS)) {
          response += `${info.emoji} **${info.name}** - ${info.description}\n`;
        }
        response += `\nWhich area would you like to focus on?`;
        return response;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const habitToolDefinitions: ToolDefinition[] = [
  addHabitDef,
  logHabitDef,
  getHabitStatsDef,
  getDueHabitsDef,
  getTendencyAdviceDef,
  getLifeDomainsDef,
];

export default habitToolDefinitions;
