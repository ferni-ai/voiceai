/**
 * Habits Domain Tool Executor
 *
 * Handles habit-related tools: createHabit, logHabit, getHabitProgress,
 * getHabitStreak, suggestHabitStack
 *
 * @module agents/shared/tool-executors/habits-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'HabitsExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'createhabit',
  'loghabit',
  'gethabitprogress',
  'gethabitstreak',
  'suggesthabitstack',
  'gethabits',
  'deletehabit',
  'pausehabit',
  'resumehabit',
] as const;

/**
 * Execute habits-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // ========================================
  // CREATE HABIT
  // ========================================
  if (fnLower === 'createhabit') {
    const name = args.name as string;
    const domain = (args.domain as string) || 'selfCare';
    const cue = args.cue as string;

    if (!name) {
      return 'What habit would you like to develop?';
    }

    log.info({ name, domain, userId: ctx.userId }, '✅ Creating habit');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const habitId = `habit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .doc(habitId)
          .set(
            cleanForFirestore({
              id: habitId,
              name,
              domain,
              cue: cue || null,
              glidepathLevel: 1, // Start at tiny version
              streak: 0,
              completions: 0,
              createdAt: new Date(),
              status: 'active',
            })
          );

        log.info({ habitId, userId: ctx.userId }, '✅ Habit created');

        return cue
          ? `Perfect! I've set up your "${name}" habit. Your cue will be: "${cue}". Start tiny - even 2 minutes counts!`
          : `Great! "${name}" is now tracking. Want to set a trigger cue to make it stick?`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit creation failed');
      }
    }

    return `I've noted your goal to build a "${name}" habit. Let's make it stick!`;
  }

  // ========================================
  // LOG HABIT
  // ========================================
  if (fnLower === 'loghabit') {
    const name = args.name as string;
    const habitId = args.habitId as string;
    const notes = args.notes as string;

    if (!name && !habitId) {
      return 'Which habit did you complete?';
    }

    log.info({ name, habitId, userId: ctx.userId }, '📝 Logging habit');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        // Find the habit
        let habitRef;
        if (habitId) {
          habitRef = db.collection('bogle_users').doc(ctx.userId).collection('habits').doc(habitId);
        } else {
          const snapshot = await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('habits')
            .where('name', '==', name)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            habitRef = snapshot.docs[0].ref;
          }
        }

        if (habitRef) {
          const habitDoc = await habitRef.get();
          const habitData = habitDoc.data();

          // Update streak and completions
          const now = new Date();
          const lastCompletion = habitData?.lastCompletedAt?.toDate?.() as Date | undefined;
          const isConsecutiveDay =
            lastCompletion && now.getTime() - lastCompletion.getTime() < 48 * 60 * 60 * 1000; // Within 48 hours

          await habitRef.update(
            cleanForFirestore({
              completions: (habitData?.completions || 0) + 1,
              streak: isConsecutiveDay ? (habitData?.streak || 0) + 1 : 1,
              lastCompletedAt: now,
            })
          );

          // Log the completion
          await habitRef.collection('logs').add(
            cleanForFirestore({
              completedAt: now,
              notes: notes || null,
            })
          );

          const newStreak = isConsecutiveDay ? (habitData?.streak || 0) + 1 : 1;

          return newStreak > 1
            ? `🔥 ${newStreak} day streak! "${habitData?.name || name}" logged. Keep it going!`
            : `✅ "${habitData?.name || name}" logged! You're building momentum.`;
        }

        return `I logged "${name}" for you. Keep it up!`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit logging failed');
      }
    }

    return `Got it! "${name}" completed. Every rep counts.`;
  }

  // ========================================
  // GET HABIT PROGRESS
  // ========================================
  if (fnLower === 'gethabitprogress') {
    const name = args.name as string;

    log.info({ name, userId: ctx.userId }, '📊 Getting habit progress');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('status', '==', 'active')
          .get();

        if (snapshot.empty) {
          return "You don't have any active habits yet. Want to start one?";
        }

        if (name) {
          // Specific habit
          const habit = snapshot.docs.find(
            (d) => (d.data().name as string).toLowerCase() === name.toLowerCase()
          );
          if (habit) {
            const data = habit.data();
            return `"${data.name}": ${data.streak || 0} day streak, ${data.completions || 0} total completions.`;
          }
          return `I couldn't find a habit called "${name}".`;
        }

        // All habits summary
        const habits = snapshot.docs.map((d) => {
          const data = d.data();
          return `${data.name}: ${data.streak || 0} day streak`;
        });

        return `Your habits: ${habits.join('; ')}`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit progress fetch failed');
      }
    }

    return "Tell me about your habits and I'll help you track them.";
  }

  // ========================================
  // GET HABIT STREAK
  // ========================================
  if (fnLower === 'gethabitstreak') {
    const name = args.name as string;

    log.info({ name, userId: ctx.userId }, '🔥 Getting habit streak');

    if (ctx.userId && name) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('name', '==', name)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          const streak = data.streak || 0;

          if (streak === 0) {
            return `No current streak for "${name}". Today's a great day to start!`;
          }
          if (streak < 7) {
            return `🔥 ${streak} day streak on "${name}"! Building momentum.`;
          }
          if (streak < 30) {
            return `🔥🔥 ${streak} day streak on "${name}"! You're on fire!`;
          }
          return `🔥🔥🔥 ${streak} day streak on "${name}"! Incredible consistency!`;
        }
      } catch {
        // Fall through
      }
    }

    return name
      ? `I don't have streak data for "${name}" yet.`
      : 'Which habit streak would you like to check?';
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

  // ========================================
  // GET HABITS (List all)
  // ========================================
  if (fnLower === 'gethabits') {
    log.info({ userId: ctx.userId }, '📋 Getting all habits');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .orderBy('createdAt', 'desc')
          .get();

        if (snapshot.empty) {
          return "You don't have any habits tracked yet. Want to start one?";
        }

        const active = snapshot.docs.filter((d) => d.data().status === 'active');
        const paused = snapshot.docs.filter((d) => d.data().status === 'paused');

        let response = `Active habits: ${active.map((d) => d.data().name).join(', ') || 'None'}`;
        if (paused.length > 0) {
          response += `. Paused: ${paused.map((d) => d.data().name).join(', ')}`;
        }

        return response;
      } catch {
        // Fall through
      }
    }

    return 'Tell me about the habits you want to build.';
  }

  // ========================================
  // DELETE/PAUSE/RESUME HABIT
  // ========================================
  if (fnLower === 'deletehabit' || fnLower === 'pausehabit' || fnLower === 'resumehabit') {
    const name = args.name as string;
    const action = fnLower.replace('habit', '');

    if (!name) {
      return `Which habit would you like to ${action}?`;
    }

    log.info({ name, action, userId: ctx.userId }, `🔧 ${action} habit`);

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('name', '==', name)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const habitRef = snapshot.docs[0].ref;

          if (action === 'delete') {
            await habitRef.delete();
            return `"${name}" has been removed. You can always start fresh later.`;
          } else {
            const newStatus = action === 'pause' ? 'paused' : 'active';
            await habitRef.update(cleanForFirestore({ status: newStatus }));
            return action === 'pause'
              ? `"${name}" is paused. Ready when you are.`
              : `"${name}" is back on! Let's keep building.`;
          }
        }

        return `I couldn't find a habit called "${name}".`;
      } catch {
        // Fall through
      }
    }

    return `I've noted your request to ${action} "${name}".`;
  }

  return null;
}

export const habitsExecutor: DomainExecutor = {
  domain: 'habits',
  handles: HANDLED_TOOLS,
  execute,
};

export default habitsExecutor;
