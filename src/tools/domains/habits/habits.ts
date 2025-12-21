/**
 * Habit Tracking Tool
 *
 * Daily habit tracking with streaks, accountability, and insights.
 *
 * Features:
 * - Multiple habit tracking
 * - Streak counting
 * - Daily check-ins
 * - Progress visualization
 * - Smart reminders
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText } from '../../validation.js';
import {
  getProductivityStore,
  type HabitData,
  type HabitLogData,
} from '../../../services/stores/productivity-store.js';
import { getLogger, generateId } from '../../utils/tool-helpers.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// Bridge functions for persistence
function habitDataToHabit(data: HabitData & { userId?: string }, userId: string): Habit {
  return {
    id: data.id,
    userId,
    name: data.name,
    description: data.description,
    category: data.category as HabitCategory,
    frequency: data.frequency as HabitFrequency,
    customDays: data.customDays,
    targetPerDay: data.targetPerDay,
    reminderTime: data.reminderTime,
    isActive: data.isActive,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function habitToHabitData(habit: Habit): HabitData {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    category: habit.category,
    frequency: habit.frequency,
    customDays: habit.customDays,
    targetPerDay: habit.targetPerDay,
    reminderTime: habit.reminderTime,
    isActive: habit.isActive,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
  };
}

function habitLogToData(log: HabitLog): HabitLogData {
  return {
    id: log.id,
    habitId: log.habitId,
    date: log.date.toISOString(),
    completed: log.completed,
    count: log.count,
    notes: log.notes,
  };
}

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

export interface Habit {
  id: string;
  userId: string;
  name: string;
  description?: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  customDays?: number[]; // 0-6 for custom frequency
  targetPerDay: number; // For habits done multiple times
  reminderTime?: string; // "08:00" format
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  date: Date;
  completed: boolean;
  count: number; // How many times done
  notes?: string;
}

// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================

const habitsCache = new Map<string, Habit>();
const habitLogsCache = new Map<string, HabitLog>();
const loadedUsers = new Set<string>();

async function ensureUserHabitsLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const habitDataList = store.getUserHabits(userId);
    for (const data of habitDataList) {
      habitsCache.set(data.id, habitDataToHabit(data, userId));
    }

    const logDataList = store.getUserHabitLogs(userId);
    for (const data of logDataList) {
      habitLogsCache.set(data.id, {
        id: data.id,
        habitId: data.habitId,
        userId,
        date: new Date(data.date),
        completed: data.completed,
        count: data.count,
        notes: data.notes,
      });
    }

    loadedUsers.add(userId);
    getLogger().debug({ userId, habits: habitDataList.length }, 'Loaded habits from store');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load habits from store');
    loadedUsers.add(userId);
  }
}

function persistHabit(userId: string, habit: Habit): void {
  try {
    const store = getProductivityStore();
    store.setHabit(userId, habitToHabitData(habit));
  } catch (error) {
    getLogger().warn({ error, habitId: habit.id }, 'Failed to persist habit');
  }
}

function persistHabitLog(userId: string, log: HabitLog): void {
  try {
    const store = getProductivityStore();
    store.setHabitLog(userId, habitLogToData(log));
  } catch (error) {
    getLogger().warn({ error, logId: log.id }, 'Failed to persist habit log');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserHabitsFromCache(userId: string): Habit[] {
  return Array.from(habitsCache.values())
    .filter((h) => h.userId === userId && h.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getHabitLogs(habitId: string, days = 30): HabitLog[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return Array.from(habitLogsCache.values())
    .filter((l) => l.habitId === habitId && l.date >= cutoff)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function getTodayLog(habitId: string): HabitLog | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    Array.from(habitLogsCache.values()).find((l) => {
      if (l.habitId !== habitId) return false;
      const logDate = new Date(l.date);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === today.getTime();
    }) || null
  );
}

function calculateStreak(habitId: string): number {
  const habit = habitsCache.get(habitId);
  if (!habit) return 0;

  const logs = getHabitLogs(habitId, 90);
  if (logs.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 90; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    checkDate.setHours(0, 0, 0, 0);

    // Check if this day should be counted based on frequency
    if (!shouldTrackOnDay(habit, checkDate)) {
      continue;
    }

    const hasLog = logs.some((l) => {
      const logDate = new Date(l.date);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === checkDate.getTime() && l.completed;
    });

    if (hasLog) {
      streak++;
    } else if (i > 0) {
      // Allow skipping today
      break;
    }
  }

  return streak;
}

function shouldTrackOnDay(habit: Habit, date: Date): boolean {
  const dayOfWeek = date.getDay();

  switch (habit.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly':
      // Track on the day the habit was created
      return dayOfWeek === new Date(habit.createdAt).getDay();
    case 'custom':
      return habit.customDays?.includes(dayOfWeek) ?? false;
    default:
      return true;
  }
}

function getCompletionRate(habitId: string, days = 30): number {
  const habit = habitsCache.get(habitId);
  if (!habit) return 0;

  const logs = getHabitLogs(habitId, days);
  let expectedDays = 0;
  let completedDays = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);

    if (shouldTrackOnDay(habit, checkDate)) {
      expectedDays++;
      const hasCompletion = logs.some((l) => {
        const logDate = new Date(l.date);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === checkDate.getTime() && l.completed;
      });
      if (hasCompletion) completedDays++;
    }
  }

  return expectedDays > 0 ? Math.round((completedDays / expectedDays) * 100) : 0;
}

function getDueHabits(userId: string): Habit[] {
  const today = new Date();
  return getUserHabitsFromCache(userId).filter((habit) => {
    if (!shouldTrackOnDay(habit, today)) return false;
    const todayLog = getTodayLog(habit.id);
    return !todayLog?.completed;
  });
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export function createHabit(params: {
  userId: string;
  name: string;
  description?: string;
  category?: HabitCategory;
  frequency?: HabitFrequency;
  customDays?: number[];
  targetPerDay?: number;
  reminderTime?: string;
}): Habit {
  const habit: Habit = {
    id: generateId('habit'),
    userId: params.userId,
    name: sanitizePlainText(params.name, 100),
    description: params.description ? sanitizePlainText(params.description, 500) : undefined,
    category: params.category || 'other',
    frequency: params.frequency || 'daily',
    customDays: params.customDays,
    targetPerDay: params.targetPerDay || 1,
    reminderTime: params.reminderTime,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to cache and persist
  habitsCache.set(habit.id, habit);
  persistHabit(params.userId, habit);

  getLogger().info({ habitId: habit.id, name: habit.name }, '✨ Habit created');

  return habit;
}

export function logHabit(params: {
  habitId: string;
  userId: string;
  count?: number;
  notes?: string;
}): HabitLog {
  const habit = habitsCache.get(params.habitId);
  if (!habit) throw new Error('Habit not found');

  // Get or create today's log
  let log = getTodayLog(params.habitId);

  if (log) {
    // Update existing
    log.count = params.count !== undefined ? params.count : log.count + 1;
    log.completed = log.count >= habit.targetPerDay;
    if (params.notes) log.notes = params.notes;
  } else {
    // Create new
    const count = params.count ?? 1;
    log = {
      id: generateId('log'),
      habitId: params.habitId,
      userId: params.userId,
      date: new Date(),
      completed: count >= habit.targetPerDay,
      count,
      notes: params.notes,
    };
  }

  // Save to cache and persist
  habitLogsCache.set(log.id, log);
  persistHabitLog(params.userId, log);

  return log;
}

export function deleteHabit(habitId: string): boolean {
  const habit = habitsCache.get(habitId);
  if (!habit) return false;

  habit.isActive = false;
  habit.updatedAt = new Date();

  // Save to cache and persist
  habitsCache.set(habitId, habit);
  persistHabit(habit.userId, habit);

  return true;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

// Export helper functions for use by other modules
export { getDueHabits, calculateStreak, getUserHabitsFromCache as getUserHabits };

export function createHabitTools() {
  return {
    addHabit: llm.tool({
      description: getToolDescription('addHabit'),
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
        reminderTime: z.string().optional().describe('When to remind (e.g., "8:00 AM")'),
      }),
      execute: async ({ name, category, frequency, targetPerDay, reminderTime }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const habit = createHabit({
          userId,
          name,
          category,
          frequency,
          targetPerDay,
          reminderTime,
        });

        let response = `✨ New habit: "${habit.name}"\n`;
        response += `📅 Frequency: ${frequency}\n`;
        if (targetPerDay > 1) {
          response += `🎯 Target: ${targetPerDay}x per day\n`;
        }
        if (reminderTime) {
          response += `⏰ Reminder: ${reminderTime}\n`;
        }

        const existingHabits = getUserHabitsFromCache(userId);
        response += `\nYou're now tracking ${existingHabits.length} habit${existingHabits.length !== 1 ? 's' : ''}. Let's build that streak! 🔥`;

        return response;
      },
    }),

    logHabit: llm.tool({
      description: getToolDescription('logHabit'),
      parameters: z.object({
        habitName: z.string().describe('Which habit to log'),
        count: z.number().optional().describe('How many times (for multi-count habits)'),
        notes: z.string().optional().describe('Any notes'),
      }),
      execute: async ({ habitName, count, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const userHabits = getUserHabitsFromCache(userId);
        const habit = userHabits.find((h) =>
          h.name.toLowerCase().includes(habitName.toLowerCase())
        );

        if (!habit) {
          return `I couldn't find a habit matching "${habitName}". Your habits:\n${userHabits.map((h) => `• ${h.name}`).join('\n') || 'None yet!'}`;
        }

        const log = logHabit({
          habitId: habit.id,
          userId,
          count,
          notes,
        });

        const streak = calculateStreak(habit.id);

        let response = '';
        if (log.completed) {
          response = `✅ "${habit.name}" done!`;
          if (streak > 0) {
            response += ` 🔥 ${streak} day streak!`;
          }
        } else {
          response = `👍 Logged "${habit.name}" (${log.count}/${habit.targetPerDay})`;
        }

        // Check remaining habits
        const remaining = getDueHabits(userId);
        if (remaining.length > 0) {
          response += `\n\n${remaining.length} habit${remaining.length > 1 ? 's' : ''} remaining today.`;
        } else {
          response += `\n\n🎉 All habits done for today! Amazing!`;
        }

        return response;
      },
    }),

    getDueHabits: llm.tool({
      description: getToolDescription('getDueHabits'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const due = getDueHabits(userId);
        const allHabits = getUserHabitsFromCache(userId);
        const completed = allHabits.length - due.length;

        if (due.length === 0) {
          if (allHabits.length === 0) {
            return `You don't have any habits set up yet. Want to start tracking one?`;
          }
          return `🎉 All ${allHabits.length} habit${allHabits.length > 1 ? 's' : ''} done for today! Excellent work!`;
        }

        let response = `📋 **Today's Habits** (${completed}/${allHabits.length} done)\n\n`;

        due.forEach((habit) => {
          const streak = calculateStreak(habit.id);
          const streakStr = streak > 0 ? ` 🔥${streak}` : '';
          response += `☐ ${habit.name}${streakStr}\n`;
        });

        if (completed > 0) {
          response += `\n✅ Completed: ${completed}`;
        }

        return response;
      },
    }),

    getHabitStats: llm.tool({
      description: getToolDescription('getHabitStats'),
      parameters: z.object({
        habitName: z.string().optional().describe('Specific habit to check'),
      }),
      execute: async ({ habitName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const userHabits = getUserHabitsFromCache(userId);

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

          const streak = calculateStreak(habit.id);
          const rate30 = getCompletionRate(habit.id, 30);
          const rate7 = getCompletionRate(habit.id, 7);
          const logs = getHabitLogs(habit.id, 7);

          let response = `📊 **${habit.name}**\n\n`;
          response += `🔥 Current Streak: ${streak} day${streak !== 1 ? 's' : ''}\n`;
          response += `📅 Last 7 days: ${rate7}%\n`;
          response += `📆 Last 30 days: ${rate30}%\n\n`;

          // Visual for last 7 days
          const today = new Date();
          response += `This week: `;
          for (let i = 6; i >= 0; i--) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            checkDate.setHours(0, 0, 0, 0);

            const hasLog = logs.some((l) => {
              const logDate = new Date(l.date);
              logDate.setHours(0, 0, 0, 0);
              return logDate.getTime() === checkDate.getTime() && l.completed;
            });

            response += hasLog ? '✅' : '⬜';
          }

          return response;
        }

        // Show all habits
        let response = `📊 **Habit Dashboard**\n\n`;

        let totalStreak = 0;
        userHabits.forEach((habit) => {
          const streak = calculateStreak(habit.id);
          const rate = getCompletionRate(habit.id, 7);
          totalStreak += streak;

          const bar = '█'.repeat(Math.floor(rate / 10)) + '░'.repeat(10 - Math.floor(rate / 10));
          response += `**${habit.name}**\n`;
          response += `  🔥 ${streak} days | ${bar} ${rate}%\n\n`;
        });

        response += `---\n`;
        response += `Combined streak power: 🔥 ${totalStreak}`;

        return response;
      },
    }),

    getAllHabits: llm.tool({
      description: getToolDescription('getAllHabits'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const userHabits = getUserHabitsFromCache(userId);

        if (userHabits.length === 0) {
          return `No habits yet! Some ideas:\n• Drink water\n• Exercise\n• Read\n• Meditate\n• Journal\n\nWant to start tracking one?`;
        }

        let response = `✨ **Your Habits** (${userHabits.length})\n\n`;

        const byCategory: Record<string, Habit[]> = {};
        userHabits.forEach((h) => {
          if (!byCategory[h.category]) byCategory[h.category] = [];
          byCategory[h.category].push(h);
        });

        for (const [category, categoryHabits] of Object.entries(byCategory)) {
          response += `**${category.toUpperCase()}**\n`;
          categoryHabits.forEach((h) => {
            const streak = calculateStreak(h.id);
            const streakStr = streak > 0 ? ` (🔥${streak})` : '';
            response += `  • ${h.name}${streakStr} - ${h.frequency}\n`;
          });
          response += '\n';
        }

        return response;
      },
    }),

    removeHabit: llm.tool({
      description: getToolDescription('removeHabit'),
      parameters: z.object({
        habitName: z.string().describe('Which habit to remove'),
        confirm: z.boolean().describe('User confirmed'),
      }),
      execute: async ({ habitName, confirm }, { ctx }) => {
        if (!confirm) {
          return `Are you sure you want to stop tracking "${habitName}"? Your streak will be lost. Say "yes, remove it" to confirm.`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const userHabits = getUserHabitsFromCache(userId);
        const habit = userHabits.find((h) =>
          h.name.toLowerCase().includes(habitName.toLowerCase())
        );

        if (!habit) {
          return `Couldn't find "${habitName}".`;
        }

        const streak = calculateStreak(habit.id);
        deleteHabit(habit.id);

        let response = `✅ Stopped tracking "${habit.name}".`;
        if (streak > 0) {
          response += `\n\n${streak} day streak saved to history. You can always start again!`;
        }

        return response;
      },
    }),

    habitCheckIn: llm.tool({
      description: getToolDescription('habitCheckIn'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserHabitsLoaded(userId);
        const allHabits = getUserHabitsFromCache(userId);
        if (allHabits.length === 0) {
          return `No habits tracked yet. Ready to build some good habits?`;
        }

        const due = getDueHabits(userId);
        const completed = allHabits.length - due.length;

        let response = `🌟 **Habit Check-In**\n\n`;

        // Completed
        const doneHabits = allHabits.filter((h) => !due.includes(h));
        if (doneHabits.length > 0) {
          response += `**Done:**\n`;
          doneHabits.forEach((h) => {
            response += `✅ ${h.name}\n`;
          });
          response += '\n';
        }

        // Remaining
        if (due.length > 0) {
          response += `**Still to do:**\n`;
          due.forEach((h) => {
            response += `☐ ${h.name}\n`;
          });
        }

        const progress = Math.round((completed / allHabits.length) * 100);
        response += `\n📊 Today's progress: ${progress}%`;

        if (progress === 100) {
          response += ` 🎉`;
        }

        return response;
      },
    }),
  };
}

export default createHabitTools;
