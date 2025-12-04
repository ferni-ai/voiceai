/**
 * Daily Routines Tool
 *
 * Support for morning and evening routines, daily rituals,
 * and structured self-care practices.
 *
 * Features:
 * - Customizable morning/evening routines
 * - Step-by-step guidance
 * - Routine tracking and streaks
 * - Flexible timing
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText } from './validation.js';
import { getProductivityStore, type RoutineData, type RoutineCompletionData } from '../services/productivity-store.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

// Bridge functions for persistence
function routineDataToRoutine(data: RoutineData, userId: string): Routine {
  return {
    id: data.id,
    userId,
    name: data.name,
    type: data.type as RoutineType,
    steps: data.steps.map(s => ({
      id: s.id,
      title: s.title,
      duration: s.duration,
      description: s.description,
      isOptional: s.isOptional,
      order: s.order,
    })),
    totalDuration: data.totalDuration,
    targetTime: data.targetTime,
    reminderEnabled: data.reminderEnabled,
    isActive: data.isActive,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function routineToRoutineData(routine: Routine): RoutineData {
  return {
    id: routine.id,
    name: routine.name,
    type: routine.type,
    steps: routine.steps,
    totalDuration: routine.totalDuration,
    targetTime: routine.targetTime,
    reminderEnabled: routine.reminderEnabled,
    isActive: routine.isActive,
    createdAt: routine.createdAt.toISOString(),
    updatedAt: routine.updatedAt.toISOString(),
  };
}

function completionToCompletionData(completion: RoutineCompletion): RoutineCompletionData {
  return {
    id: completion.id,
    routineId: completion.routineId,
    date: completion.date.toISOString(),
    completedSteps: completion.completedSteps,
    totalSteps: completion.totalSteps,
    completionPercent: completion.completionPercent,
    duration: completion.duration,
    notes: completion.notes,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export type RoutineType = 'morning' | 'evening' | 'workout' | 'wind_down' | 'focus' | 'custom';

export interface RoutineStep {
  id: string;
  title: string;
  duration: number; // minutes
  description?: string;
  isOptional: boolean;
  order: number;
}

export interface Routine {
  id: string;
  userId: string;
  name: string;
  type: RoutineType;
  steps: RoutineStep[];
  totalDuration: number; // minutes
  targetTime?: string; // "06:30" format
  reminderEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutineCompletion {
  id: string;
  routineId: string;
  userId: string;
  date: Date;
  completedSteps: string[]; // step IDs
  totalSteps: number;
  completionPercent: number;
  duration: number; // actual time taken
  notes?: string;
}

// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================

const routinesCache: Map<string, Routine> = new Map();
const completionsCache: Map<string, RoutineCompletion> = new Map();
const loadedUsers: Set<string> = new Set();

async function ensureUserRoutinesLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;
  
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);
    
    const routineDataList = store.getUserRoutines(userId);
    for (const data of routineDataList) {
      routinesCache.set(data.id, routineDataToRoutine(data, userId));
    }
    
    loadedUsers.add(userId);
    getLogger().debug({ userId, routines: routineDataList.length }, 'Loaded routines from store');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load routines from store');
    loadedUsers.add(userId);
  }
}

function persistRoutine(userId: string, routine: Routine): void {
  try {
    const store = getProductivityStore();
    store.setRoutine(userId, routineToRoutineData(routine));
  } catch (error) {
    getLogger().warn({ error, routineId: routine.id }, 'Failed to persist routine');
  }
}

function persistCompletion(userId: string, completion: RoutineCompletion): void {
  try {
    const store = getProductivityStore();
    store.setRoutineCompletion(userId, completionToCompletionData(completion));
  } catch (error) {
    getLogger().warn({ error, completionId: completion.id }, 'Failed to persist completion');
  }
}

// ============================================================================
// DEFAULT TEMPLATES
// ============================================================================

const ROUTINE_TEMPLATES: Record<RoutineType, { steps: Omit<RoutineStep, 'id'>[] }> = {
  morning: {
    steps: [
      { title: 'Wake up, no snooze', duration: 1, isOptional: false, order: 1 },
      { title: 'Drink water', duration: 2, description: 'Full glass of water', isOptional: false, order: 2 },
      { title: 'Stretch or light movement', duration: 5, isOptional: false, order: 3 },
      { title: 'Mindfulness/meditation', duration: 10, isOptional: true, order: 4 },
      { title: 'Shower and get ready', duration: 15, isOptional: false, order: 5 },
      { title: 'Healthy breakfast', duration: 15, isOptional: false, order: 6 },
      { title: 'Review day\'s priorities', duration: 5, description: 'Top 3 things', isOptional: false, order: 7 },
    ],
  },
  evening: {
    steps: [
      { title: 'Set tomorrow\'s clothes out', duration: 5, isOptional: true, order: 1 },
      { title: 'Review tomorrow\'s schedule', duration: 5, isOptional: false, order: 2 },
      { title: 'Tidy up space', duration: 10, isOptional: true, order: 3 },
      { title: 'No screens (start)', duration: 1, description: 'Put devices away', isOptional: false, order: 4 },
      { title: 'Journal or reflect', duration: 10, description: '3 gratitudes, 1 highlight', isOptional: true, order: 5 },
      { title: 'Read', duration: 15, isOptional: true, order: 6 },
      { title: 'Wind down activities', duration: 15, description: 'Tea, stretching, etc.', isOptional: true, order: 7 },
      { title: 'Lights out', duration: 1, isOptional: false, order: 8 },
    ],
  },
  workout: {
    steps: [
      { title: 'Warm up', duration: 5, description: 'Light cardio, dynamic stretches', isOptional: false, order: 1 },
      { title: 'Main workout', duration: 30, isOptional: false, order: 2 },
      { title: 'Cool down', duration: 5, description: 'Slow movement', isOptional: false, order: 3 },
      { title: 'Stretch', duration: 10, isOptional: false, order: 4 },
      { title: 'Hydrate', duration: 2, isOptional: false, order: 5 },
    ],
  },
  wind_down: {
    steps: [
      { title: 'Dim lights', duration: 1, isOptional: false, order: 1 },
      { title: 'Relaxing music or silence', duration: 1, isOptional: true, order: 2 },
      { title: 'Gentle stretching', duration: 10, isOptional: true, order: 3 },
      { title: 'Deep breathing', duration: 5, description: '4-7-8 breathing', isOptional: false, order: 4 },
      { title: 'Body scan meditation', duration: 10, isOptional: true, order: 5 },
    ],
  },
  focus: {
    steps: [
      { title: 'Clear workspace', duration: 2, isOptional: false, order: 1 },
      { title: 'Set intention', duration: 2, description: 'What will you accomplish?', isOptional: false, order: 2 },
      { title: 'Phone on DND', duration: 1, isOptional: false, order: 3 },
      { title: 'Water nearby', duration: 1, isOptional: true, order: 4 },
      { title: 'Deep work session', duration: 50, isOptional: false, order: 5 },
      { title: 'Short break', duration: 10, description: 'Move, hydrate', isOptional: false, order: 6 },
    ],
  },
  custom: {
    steps: [],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserRoutines(userId: string): Routine[] {
  return Array.from(routinesCache.values()).filter((r) => r.userId === userId && r.isActive);
}

function getRoutineCompletions(routineId: string, days: number = 30): RoutineCompletion[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return Array.from(completionsCache.values())
    .filter((c) => c.routineId === routineId && c.date >= cutoff)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function calculateStreak(routineId: string): number {
  const recentCompletions = getRoutineCompletions(routineId, 60);
  if (recentCompletions.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 60; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    checkDate.setHours(0, 0, 0, 0);

    const hasCompletion = recentCompletions.some((c) => {
      const compDate = new Date(c.date);
      compDate.setHours(0, 0, 0, 0);
      return compDate.getTime() === checkDate.getTime() && c.completionPercent >= 80;
    });

    if (hasCompletion) {
      streak++;
    } else if (i > 0) {
      // Allow skipping today but not past days
      break;
    }
  }

  return streak;
}

function getTodayCompletion(routineId: string): RoutineCompletion | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    Array.from(completionsCache.values()).find((c) => {
      if (c.routineId !== routineId) return false;
      const compDate = new Date(c.date);
      compDate.setHours(0, 0, 0, 0);
      return compDate.getTime() === today.getTime();
    }) || null
  );
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export function createRoutine(params: {
  userId: string;
  name: string;
  type: RoutineType;
  customSteps?: Omit<RoutineStep, 'id'>[];
  targetTime?: string;
  reminderEnabled?: boolean;
}): Routine {
  const template = ROUTINE_TEMPLATES[params.type];
  const steps = (params.customSteps || template.steps).map((s, i) => ({
    ...s,
    id: generateId('step'),
    order: s.order || i + 1,
  }));

  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

  const routine: Routine = {
    id: generateId('routine'),
    userId: params.userId,
    name: sanitizePlainText(params.name, 100),
    type: params.type,
    steps,
    totalDuration,
    targetTime: params.targetTime,
    reminderEnabled: params.reminderEnabled ?? true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to cache and persist
  routinesCache.set(routine.id, routine);
  persistRoutine(params.userId, routine);

  getLogger().info(
    { routineId: routine.id, name: routine.name, steps: steps.length },
    '🌅 Routine created'
  );

  return routine;
}

export function startRoutine(routineId: string): {
  routine: Routine;
  currentStep: RoutineStep;
  stepsRemaining: number;
} | null {
  const routine = routinesCache.get(routineId);
  if (!routine) return null;

  const orderedSteps = [...routine.steps].sort((a, b) => a.order - b.order);

  return {
    routine,
    currentStep: orderedSteps[0],
    stepsRemaining: orderedSteps.length,
  };
}

export function completeRoutineStep(
  routineId: string,
  stepId: string,
  userId: string
): {
  completed: boolean;
  nextStep?: RoutineStep;
  routineComplete: boolean;
  completion?: RoutineCompletion;
} | null {
  const routine = routinesCache.get(routineId);
  if (!routine) return null;

  // Get or create today's completion record
  let completion = getTodayCompletion(routineId);
  if (!completion) {
    completion = {
      id: generateId('completion'),
      routineId,
      userId,
      date: new Date(),
      completedSteps: [],
      totalSteps: routine.steps.filter((s) => !s.isOptional).length,
      completionPercent: 0,
      duration: 0,
    };
  }

  // Add step if not already completed
  if (!completion.completedSteps.includes(stepId)) {
    completion.completedSteps.push(stepId);
    const step = routine.steps.find((s) => s.id === stepId);
    if (step) {
      completion.duration += step.duration;
    }
  }

  // Calculate completion percentage
  const requiredSteps = routine.steps.filter((s) => !s.isOptional);
  const completedRequired = requiredSteps.filter((s) =>
    completion!.completedSteps.includes(s.id)
  ).length;
  completion.completionPercent = Math.round((completedRequired / requiredSteps.length) * 100);

  // Save to cache and persist
  completionsCache.set(completion.id, completion);
  persistCompletion(userId, completion);

  // Find next step
  const orderedSteps = [...routine.steps].sort((a, b) => a.order - b.order);
  const currentIndex = orderedSteps.findIndex((s) => s.id === stepId);
  const nextStep = orderedSteps[currentIndex + 1];

  return {
    completed: true,
    nextStep,
    routineComplete: !nextStep || completion.completionPercent >= 100,
    completion,
  };
}

export function skipRoutineStep(routineId: string, stepId: string): RoutineStep | null {
  const routine = routinesCache.get(routineId);
  if (!routine) return null;

  const orderedSteps = [...routine.steps].sort((a, b) => a.order - b.order);
  const currentIndex = orderedSteps.findIndex((s) => s.id === stepId);

  return orderedSteps[currentIndex + 1] || null;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createRoutineTools() {
  return {
    createRoutine: llm.tool({
      description: `Create a new daily routine from a template or custom steps.
Use when user wants to:
- Set up a morning routine
- Create an evening wind-down
- Build a workout routine
- Design a custom routine`,
      parameters: z.object({
        name: z.string().describe('Routine name'),
        type: z
          .enum(['morning', 'evening', 'workout', 'wind_down', 'focus', 'custom'])
          .describe('Type of routine'),
        targetTime: z
          .string()
          .optional()
          .describe('When to do it (e.g., "6:30 AM", "9:00 PM")'),
        reminderEnabled: z.boolean().optional().default(true),
      }),
      execute: async ({ name, type, targetTime, reminderEnabled }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserRoutinesLoaded(userId);
        const routine = createRoutine({
          userId,
          name,
          type,
          targetTime,
          reminderEnabled,
        });

        let response = `🌅 Created "${routine.name}" routine!\n\n`;
        response += `**${routine.steps.length} steps** (${routine.totalDuration} minutes total)\n\n`;

        routine.steps.forEach((step, i) => {
          const optional = step.isOptional ? ' (optional)' : '';
          response += `${i + 1}. ${step.title} - ${step.duration} min${optional}\n`;
        });

        if (targetTime) {
          response += `\n⏰ Target time: ${targetTime}`;
        }

        response += `\n\nSay "start my ${type} routine" when you're ready!`;

        return response;
      },
    }),

    startRoutine: llm.tool({
      description: `Begin a routine and guide through steps.
Use when user says "start my morning routine" etc.`,
      parameters: z.object({
        routineType: z
          .enum(['morning', 'evening', 'workout', 'wind_down', 'focus'])
          .optional()
          .describe('Which routine type to start'),
        routineName: z.string().optional().describe('Specific routine by name'),
      }),
      execute: async ({ routineType, routineName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserRoutinesLoaded(userId);
        let userRoutines = getUserRoutines(userId);

        // Filter by type or name
        if (routineName) {
          userRoutines = userRoutines.filter((r) =>
            r.name.toLowerCase().includes(routineName.toLowerCase())
          );
        } else if (routineType) {
          userRoutines = userRoutines.filter((r) => r.type === routineType);
        }

        if (userRoutines.length === 0) {
          if (routineType) {
            // Create default routine of this type
            const routine = createRoutine({
              userId,
              name: `My ${routineType} routine`,
              type: routineType,
            });
            userRoutines = [routine];
          } else {
            return `You don't have any routines set up yet. Want me to create a morning or evening routine for you?`;
          }
        }

        const routine = userRoutines[0];
        const result = startRoutine(routine.id);
        if (!result) return `Error starting routine.`;

        const streak = calculateStreak(routine.id);

        let response = `🌅 Starting "${routine.name}"!\n`;
        if (streak > 0) {
          response += `🔥 ${streak} day streak!\n`;
        }
        response += `\n**Step 1 of ${routine.steps.length}:**\n`;
        response += `➡️ ${result.currentStep.title} (${result.currentStep.duration} min)\n`;
        if (result.currentStep.description) {
          response += `   ${result.currentStep.description}\n`;
        }
        response += `\nSay "done" when ready for the next step, or "skip" to move on.`;

        return response;
      },
    }),

    routineStepDone: llm.tool({
      description: `Mark current routine step as done and get the next step.`,
      parameters: z.object({
        routineName: z.string().optional().describe('Which routine'),
        stepTitle: z.string().optional().describe('Which step was completed'),
      }),
      execute: async ({ routineName, stepTitle }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserRoutinesLoaded(userId);
        // Find the active routine
        const userRoutines = getUserRoutines(userId);
        const routine = routineName
          ? userRoutines.find((r) => r.name.toLowerCase().includes(routineName.toLowerCase()))
          : userRoutines[0];

        if (!routine) {
          return `I couldn't find an active routine. Say "start routine" to begin.`;
        }

        // Find the step (or use first incomplete)
        const todayCompletion = getTodayCompletion(routine.id);
        const orderedSteps = [...routine.steps].sort((a, b) => a.order - b.order);

        let step: RoutineStep | undefined;
        if (stepTitle) {
          step = routine.steps.find((s) =>
            s.title.toLowerCase().includes(stepTitle.toLowerCase())
          );
        } else {
          // Find first incomplete step
          step = orderedSteps.find(
            (s) => !todayCompletion?.completedSteps.includes(s.id)
          );
        }

        if (!step) {
          return `All steps completed! 🎉`;
        }

        const result = completeRoutineStep(routine.id, step.id, userId);
        if (!result) return `Error completing step.`;

        if (result.routineComplete) {
          const streak = calculateStreak(routine.id);
          let response = `🎉 **Routine Complete!**\n\n`;
          response += `✅ ${routine.name} done for today!\n`;
          response += `🔥 Streak: ${streak} day${streak !== 1 ? 's' : ''}\n`;
          response += `⏱️ Total time: ${result.completion?.duration} minutes\n\n`;
          response += `Great way to ${routine.type === 'morning' ? 'start' : 'end'} the day!`;
          return response;
        }

        let response = `✅ Done: ${step.title}\n\n`;
        if (result.nextStep) {
          response += `**Next:**\n`;
          response += `➡️ ${result.nextStep.title} (${result.nextStep.duration} min)\n`;
          if (result.nextStep.description) {
            response += `   ${result.nextStep.description}\n`;
          }
          const remaining = orderedSteps.filter(
            (s) => !result.completion?.completedSteps.includes(s.id) && s.id !== result.nextStep!.id
          ).length;
          response += `\n${remaining} step${remaining !== 1 ? 's' : ''} remaining.`;
        }

        return response;
      },
    }),

    skipRoutineStep: llm.tool({
      description: `Skip the current routine step and move to the next.`,
      parameters: z.object({
        routineName: z.string().optional(),
      }),
      execute: async ({ routineName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserRoutinesLoaded(userId);
        const userRoutines = getUserRoutines(userId);
        const routine = routineName
          ? userRoutines.find((r) => r.name.toLowerCase().includes(routineName.toLowerCase()))
          : userRoutines[0];

        if (!routine) {
          return `No active routine found.`;
        }

        const todayCompletion = getTodayCompletion(routine.id);
        const orderedSteps = [...routine.steps].sort((a, b) => a.order - b.order);

        // Find current step
        const currentStep = orderedSteps.find(
          (s) => !todayCompletion?.completedSteps.includes(s.id)
        );

        if (!currentStep) {
          return `No steps to skip - routine is complete!`;
        }

        const nextStep = skipRoutineStep(routine.id, currentStep.id);

        if (!nextStep) {
          return `That was the last step. Routine finished!`;
        }

        let response = `⏭️ Skipped: ${currentStep.title}\n\n`;
        response += `**Next:**\n`;
        response += `➡️ ${nextStep.title} (${nextStep.duration} min)\n`;
        if (nextStep.description) {
          response += `   ${nextStep.description}\n`;
        }

        return response;
      },
    }),

    getRoutineProgress: llm.tool({
      description: `Check routine progress and streaks.`,
      parameters: z.object({
        routineName: z.string().optional(),
      }),
      execute: async ({ routineName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserRoutinesLoaded(userId);
        const userRoutines = getUserRoutines(userId);

        if (userRoutines.length === 0) {
          return `You don't have any routines yet. Want me to help you create one?`;
        }

        let response = `📊 **Routine Progress**\n\n`;

        for (const routine of userRoutines) {
          const streak = calculateStreak(routine.id);
          const todayCompletion = getTodayCompletion(routine.id);
          const recentCompletions = getRoutineCompletions(routine.id, 7);
          const weeklyRate = Math.round((recentCompletions.length / 7) * 100);

          response += `**${routine.name}** (${routine.type})\n`;
          response += `🔥 Streak: ${streak} day${streak !== 1 ? 's' : ''}\n`;
          response += `📅 This week: ${recentCompletions.length}/7 (${weeklyRate}%)\n`;

          if (todayCompletion) {
            response += `✅ Today: ${todayCompletion.completionPercent}% done\n`;
          } else {
            response += `⬜ Today: Not started\n`;
          }

          response += `\n`;
        }

        return response;
      },
    }),

    listRoutines: llm.tool({
      description: `Show all user's routines.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserRoutinesLoaded(userId);
        const userRoutines = getUserRoutines(userId);

        if (userRoutines.length === 0) {
          return `You don't have any routines yet.\n\nI can help you create:\n• Morning routine\n• Evening routine\n• Workout routine\n• Focus routine\n\nWhich sounds good?`;
        }

        let response = `🌅 **Your Routines**\n\n`;

        for (const routine of userRoutines) {
          const streak = calculateStreak(routine.id);
          response += `**${routine.name}**\n`;
          response += `  Type: ${routine.type}\n`;
          response += `  Steps: ${routine.steps.length}\n`;
          response += `  Duration: ${routine.totalDuration} min\n`;
          if (routine.targetTime) {
            response += `  Time: ${routine.targetTime}\n`;
          }
          if (streak > 0) {
            response += `  🔥 ${streak} day streak\n`;
          }
          response += `\n`;
        }

        return response;
      },
    }),
  };
}

export default createRoutineTools;

