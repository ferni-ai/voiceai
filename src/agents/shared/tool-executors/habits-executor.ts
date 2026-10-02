/**
 * Habits Domain Tool Executor
 *
 * Handles habit-related tools: createHabit, logHabit / logHabitCompletion,
 * getHabits, getHabitProgress, getHabitStreak, suggestHabitStack, pause/resume/delete.
 * Data lives in the canonical aspirations store (services/aspirations).
 *
 * @module agents/shared/tool-executors/habits-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'HabitsExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Domain tool names (camelCase)
  'createhabit',
  'loghabit',
  'gethabitprogress',
  'gethabitstreak',
  'suggesthabitstack',
  'gethabits',
  'loghabitcompletion',
  'deletehabit',
  'pausehabit',
  'resumehabit',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // habit_log category
  'habit_log',
  'habit_complete',
  'habit_track',
  // habit_create category
  'habit_create',
  'habit_dna',
  'habit_bundles',
  // habit_view category
  'habit_list',
  'habit_streak',
  'habit_progress',
  // habit_coaching category
  'habit_coaching',
  'habit_pace',
  'habit_guidance',
  // routine categories
  'routine_run',
  'routine_start',
  'winddown_start',
  'routine_create',
  'routine_list',
  'routine_edit',
] as const;

/** Map FTIS tool IDs to canonical names */
const TOOL_ALIASES: Record<string, string> = {
  // habit_log
  habit_log: 'loghabit',
  habit_complete: 'loghabit',
  habit_track: 'loghabit',
  // habit_create
  habit_create: 'createhabit',
  habit_dna: 'createhabit',
  habit_bundles: 'createhabit',
  // habit_view
  habit_list: 'gethabits',
  habit_streak: 'gethabitstreak',
  habit_progress: 'gethabitprogress',
  // habit_coaching (uses habit progress)
  habit_coaching: 'gethabitprogress',
  habit_pace: 'gethabitprogress',
  habit_guidance: 'suggesthabitstack',
  // routines (map to habits for now)
  routine_run: 'loghabit',
  routine_start: 'loghabit',
  winddown_start: 'loghabit',
  routine_create: 'createhabit',
  routine_list: 'gethabits',
  routine_edit: 'createhabit',
};

/**
 * Execute habits-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  let fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // Resolve FTIS aliases to canonical tool names
  if (TOOL_ALIASES[fnLower]) {
    log.debug(
      { original: fnLower, resolved: TOOL_ALIASES[fnLower] },
      '🔀 Resolving FTIS tool alias'
    );
    fnLower = TOOL_ALIASES[fnLower];
  }

  // Every habit op reads/writes the canonical aspirations store.
  const voice = await import('../../../services/aspirations/voice.js');
  const userId = ctx.userId;
  const name = ((args.name as string) || (args.habitName as string) || '').trim();
  const vctx = {
    userId: userId ?? '',
    ...(ctx.sessionId ? { conversationId: ctx.sessionId } : {}),
    ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
  };

  if (fnLower === 'createhabit') {
    if (!name) return 'What habit would you like to build?';
    if (!userId) return `"${name}" is a great one. Let's make it tiny enough to stick.`;
    log.info({ userId }, 'Creating habit');
    const frequency = (args.frequency as string) === 'weekly' ? 'weekly' : 'daily';
    return voice.voiceCreateHabit(vctx, {
      name,
      frequency,
      ...(typeof args.cue === 'string' ? { cue: args.cue } : {}),
      ...(typeof args.reminderTime === 'string' ? { reminderTime: args.reminderTime } : {}),
      ...(typeof args.goal === 'string' ? { goal: args.goal } : {}),
    });
  }

  if (fnLower === 'loghabit' || fnLower === 'loghabitcompletion') {
    if (!name) return 'Which habit did you do?';
    if (!userId) return `Nice work on "${name}"!`;
    log.info({ userId }, 'Logging habit');
    return voice.voiceLogHabit(vctx, {
      name,
      ...(typeof args.notes === 'string' ? { note: args.notes } : {}),
      ...(args.missed === true || args.status === 'missed' ? { missed: true } : {}),
    });
  }

  if (fnLower === 'gethabitprogress' || fnLower === 'gethabits') {
    if (!userId) return "Tell me about your habits and I'll help you track them.";
    if (name && fnLower === 'gethabitprogress') return voice.voiceHabitStreak(vctx, name);
    return voice.voiceListHabits(vctx);
  }

  if (fnLower === 'gethabitstreak') {
    if (!userId || !name) return 'Which habit streak would you like to check?';
    return voice.voiceHabitStreak(vctx, name);
  }

  // ========================================
  // SUGGEST HABIT STACK
  // ========================================
  if (fnLower === 'suggesthabitstack') {
    const existingHabit = args.existingHabit as string;
    const newHabit = args.newHabit as string;

    log.info({ existingHabit, newHabit, userId: ctx.userId }, '🔗 Suggesting habit stack');

    if (existingHabit && newHabit) {
      return `Great stack idea! After "${existingHabit}", immediately do "${newHabit}". The key is making it automatic - no decision needed.`;
    }

    if (existingHabit) {
      return `What habit would you like to stack after "${existingHabit}"?`;
    }

    if (newHabit) {
      return `What existing habit can anchor "${newHabit}"? Think of something you already do daily.`;
    }

    return 'Habit stacking works by linking a new habit to an existing one. What habits are you thinking about?';
  }

  if (fnLower === 'deletehabit' || fnLower === 'pausehabit' || fnLower === 'resumehabit') {
    const action = fnLower.replace('habit', '');
    if (!name) return `Which habit would you like to ${action}?`;
    if (!userId) return `I've noted that.`;
    const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'let-go';
    return voice.voiceSetStatus(vctx, { name, status, level: 'habit' });
  }

  return null;
}

export const habitsExecutor: DomainExecutor = {
  domain: 'habits',
  handles: HANDLED_TOOLS,
  execute,
};

export default habitsExecutor;
