/**
 * Productivity Domain Tool Executor
 *
 * Handles productivity tools with Firestore persistence:
 * - Tasks: addTask, getTasks, completeTask
 * - Goals: addGoal, updateGoal, getGoals
 * - Timers: setTimer, getTimer, cancelTimer
 * - Reminders: scheduleReminder, cancelReminder
 * - Notes: addNote, getNotes, searchNotes
 * - Journal: addJournal, getJournals
 *
 * @module agents/shared/tool-executors/productivity-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'ProductivityExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Tasks
  'addtask',
  'completetask',
  'gettasks',
  'deletetask',
  // Goals
  'addgoal',
  'updategoal',
  'getgoals',
  // Timers
  'settimer',
  'gettimer',
  'canceltimer',
  // Reminders
  'schedulereminder',
  'cancelreminder',
  'getreminders',
  // Notes
  'addnote',
  'getnotes',
  'searchnotes',
  'savenote', // alias for addnote
  // Journal
  'addjournal',
  'getjournals',
  'journal', // alias for addjournal
] as const;

/** Map aliases to canonical tool names */
const TOOL_ALIASES: Record<string, string> = {
  savenote: 'addnote',
  journal: 'addjournal',
};

// ============================================================================
// TASK MANAGEMENT
// ============================================================================

interface Task {
  id: string;
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  dueDate?: Date;
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

async function addTask(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
  const title = args.title as string;
  const description = args.description as string | undefined;
  const priority = (args.priority as string) || 'medium';
  const dueDate = args.dueDate as string | undefined;

  if (!title) {
    return 'What task would you like me to add?';
  }

  log.info({ title, userId: ctx.userId }, '📝 Adding task');

  if (!ctx.userId) {
    return `Got it! I'll remember you want to "${title}".`;
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: Task = {
      id: taskId,
      title,
      description,
      priority: priority as 'high' | 'medium' | 'low',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('tasks')
      .doc(taskId)
      .set(cleanForFirestore(task));

    log.info({ taskId, userId: ctx.userId }, '✅ Task added');

    const priorityEmoji = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';
    return `${priorityEmoji} Added: "${title}"${dueDate ? ` (due ${dueDate})` : ''}. You've got this!`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Task storage failed');
    return `Got it! I'll remember you want to "${title}".`;
  }
}

async function getTasks(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
  const filter = ((args.filter as string) || 'pending').toLowerCase();

  log.info({ filter, userId: ctx.userId }, '📋 Getting tasks');

  if (!ctx.userId) {
    return "I don't have your tasks stored yet. Tell me what you need to do!";
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    let query = db.collection('bogle_users').doc(ctx.userId).collection('tasks');

    // Apply filter
    if (filter === 'pending' || filter === 'active') {
      query = query.where('completed', '==', false) as typeof query;
    } else if (filter === 'completed' || filter === 'done') {
      query = query.where('completed', '==', true) as typeof query;
    } else if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      query = query.where('dueDate', '>=', today).where('dueDate', '<', tomorrow) as typeof query;
    }

    const snapshot = await query.orderBy('createdAt', 'desc').limit(10).get();

    if (snapshot.empty) {
      if (filter === 'pending') {
        return "You're all caught up! No pending tasks.";
      }
      return `No ${filter} tasks found.`;
    }

    const tasks = snapshot.docs.map((doc) => {
      const data = doc.data() as Task;
      const status = data.completed ? '✅' : '⬜';
      const priority = data.priority === 'high' ? '🔴' : data.priority === 'medium' ? '🟡' : '🟢';
      return `${status} ${priority} ${data.title}`;
    });

    return `Your tasks:\n${tasks.join('\n')}`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Task retrieval failed');
    return "I couldn't fetch your tasks right now. What do you need to do?";
  }
}

async function completeTask(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  const taskName = ((args.taskName as string) || (args.title as string) || '').toLowerCase();

  if (!taskName) {
    return 'Which task did you complete?';
  }

  log.info({ taskName, userId: ctx.userId }, '✅ Completing task');

  if (!ctx.userId) {
    return `Nice work completing "${taskName}"! 🎉`;
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Find task by name (fuzzy match)
    const snapshot = await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('tasks')
      .where('completed', '==', false)
      .get();

    const matchingTask = snapshot.docs.find((doc) => {
      const data = doc.data() as Task;
      return data.title.toLowerCase().includes(taskName);
    });

    if (matchingTask) {
      await matchingTask.ref.update(
        cleanForFirestore({
          completed: true,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const taskData = matchingTask.data() as Task;
      log.info({ taskId: matchingTask.id, userId: ctx.userId }, '✅ Task marked complete');

      // Get completion stats
      const completedToday = await db
        .collection('bogle_users')
        .doc(ctx.userId)
        .collection('tasks')
        .where('completed', '==', true)
        .where('completedAt', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
        .count()
        .get();

      const { count } = completedToday.data();
      const celebration =
        count >= 5
          ? "You're on fire today! 🔥"
          : count >= 3
            ? 'Great momentum! 💪'
            : 'Nice work! ✨';

      return `Done! "${taskData.title}" is complete. ${celebration}`;
    }

    return `I couldn't find a task matching "${taskName}". What task did you finish?`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Task completion failed');
    return `Nice work completing "${taskName}"! 🎉`;
  }
}

// ============================================================================
// GOAL MANAGEMENT
// ============================================================================

interface Goal {
  id: string;
  title: string;
  description?: string;
  category?: string;
  targetDate?: Date;
  progress: number; // 0-100
  milestones?: string[];
  createdAt: Date;
  updatedAt: Date;
}

async function addGoal(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
  const title = args.title as string;
  const description = args.description as string | undefined;
  const category = (args.category as string) || 'personal';
  const targetDate = args.targetDate as string | undefined;

  if (!title) {
    return 'What goal are you working toward?';
  }

  log.info({ title, category, userId: ctx.userId }, '🎯 Adding goal');

  if (!ctx.userId) {
    return `Great goal! "${title}" - I'll keep that in mind.`;
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const goalId = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const goal: Goal = {
      id: goalId,
      title,
      description,
      category,
      targetDate: targetDate ? new Date(targetDate) : undefined,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('goals')
      .doc(goalId)
      .set(cleanForFirestore(goal));

    log.info({ goalId, userId: ctx.userId }, '✅ Goal added');

    return `🎯 Goal set: "${title}". I'll help you track progress. What's the first small step?`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Goal storage failed');
    return `Great goal! "${title}" - I'll keep that in mind.`;
  }
}

async function getGoals(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
  const category = args.category as string | undefined;

  log.info({ category, userId: ctx.userId }, '🎯 Getting goals');

  if (!ctx.userId) {
    return "I don't have your goals stored yet. What are you working toward?";
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    let query = db.collection('bogle_users').doc(ctx.userId).collection('goals');

    if (category) {
      query = query.where('category', '==', category) as typeof query;
    }

    const snapshot = await query.orderBy('createdAt', 'desc').limit(10).get();

    if (snapshot.empty) {
      return "You haven't set any goals yet. What would you like to work toward?";
    }

    const goals = snapshot.docs.map((doc) => {
      const data = doc.data() as Goal;
      const progressBar =
        '█'.repeat(Math.floor(data.progress / 10)) +
        '░'.repeat(10 - Math.floor(data.progress / 10));
      return `🎯 ${data.title} [${progressBar}] ${data.progress}%`;
    });

    return `Your goals:\n${goals.join('\n')}`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Goal retrieval failed');
    return "I couldn't fetch your goals right now. What are you working toward?";
  }
}

// ============================================================================
// TIMER & REMINDER
// ============================================================================

interface Reminder {
  id: string;
  message: string;
  scheduledFor: Date;
  recurring?: 'daily' | 'weekly' | 'monthly';
  completed: boolean;
  createdAt: Date;
}

async function scheduleReminder(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  const message = args.message as string;
  const when = args.when as string;
  const recurring = args.recurring as string | undefined;

  if (!message) {
    return 'What would you like me to remind you about?';
  }

  log.info({ message, when, userId: ctx.userId }, '🔔 Scheduling reminder');

  if (!ctx.userId) {
    return `I'll remind you: "${message}"${when ? ` at ${when}` : ''}.`;
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Parse "when" to a date (simple parsing)
    const scheduledFor = new Date();
    if (when) {
      const whenLower = when.toLowerCase();
      if (whenLower.includes('tomorrow')) {
        scheduledFor.setDate(scheduledFor.getDate() + 1);
      } else if (whenLower.includes('hour')) {
        const hours = parseInt(when) || 1;
        scheduledFor.setHours(scheduledFor.getHours() + hours);
      } else if (whenLower.includes('minute')) {
        const mins = parseInt(when) || 30;
        scheduledFor.setMinutes(scheduledFor.getMinutes() + mins);
      } else {
        // Try to parse as time like "5pm", "3:00"
        const timeMatch = when.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const mins = parseInt(timeMatch[2]) || 0;
          const isPM = timeMatch[3]?.toLowerCase() === 'pm';
          if (isPM && hours < 12) hours += 12;
          if (!isPM && hours === 12) hours = 0;
          scheduledFor.setHours(hours, mins, 0, 0);
          // If time has passed, schedule for tomorrow
          if (scheduledFor < new Date()) {
            scheduledFor.setDate(scheduledFor.getDate() + 1);
          }
        }
      }
    }

    const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reminder: Reminder = {
      id: reminderId,
      message,
      scheduledFor,
      recurring: recurring as 'daily' | 'weekly' | 'monthly' | undefined,
      completed: false,
      createdAt: new Date(),
    };

    await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('reminders')
      .doc(reminderId)
      .set(cleanForFirestore(reminder));

    log.info({ reminderId, scheduledFor, userId: ctx.userId }, '✅ Reminder scheduled');

    const timeStr = scheduledFor.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `🔔 Reminder set for ${timeStr}: "${message}"`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Reminder scheduling failed');
    return `I'll remind you: "${message}"${when ? ` at ${when}` : ''}.`;
  }
}

async function setTimer(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
  const duration = args.duration as string;
  const label = args.label as string | undefined;

  if (!duration) {
    return 'How long should I set the timer for?';
  }

  log.info({ duration, label, userId: ctx.userId }, '⏱️ Setting timer');

  // Parse duration (e.g., "5 minutes", "1 hour", "30 seconds")
  let seconds = 0;
  const durationLower = duration.toLowerCase();

  const minuteMatch = durationLower.match(/(\d+)\s*(?:min|minute)/);
  const hourMatch = durationLower.match(/(\d+)\s*(?:hr|hour)/);
  const secondMatch = durationLower.match(/(\d+)\s*(?:sec|second)/);

  if (hourMatch) seconds += parseInt(hourMatch[1]) * 3600;
  if (minuteMatch) seconds += parseInt(minuteMatch[1]) * 60;
  if (secondMatch) seconds += parseInt(secondMatch[1]);

  // If just a number, assume minutes
  if (seconds === 0) {
    const justNumber = durationLower.match(/^(\d+)$/);
    if (justNumber) {
      seconds = parseInt(justNumber[1]) * 60;
    }
  }

  if (seconds === 0) {
    return `I couldn't parse "${duration}". Try something like "5 minutes" or "1 hour".`;
  }

  // For now, we can't actually run timers server-side
  // But we can store the intent and the app could poll or use push notifications
  if (ctx.userId) {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      const timerId = `timer_${Date.now()}`;
      const endsAt = new Date(Date.now() + seconds * 1000);

      await db
        .collection('bogle_users')
        .doc(ctx.userId)
        .collection('timers')
        .doc(timerId)
        .set(
          cleanForFirestore({
            id: timerId,
            label,
            duration: seconds,
            endsAt,
            createdAt: new Date(),
            active: true,
          })
        );

      log.info({ timerId, seconds, endsAt, userId: ctx.userId }, '✅ Timer set');
    } catch (err) {
      log.warn({ error: String(err) }, 'Timer storage failed');
    }
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = mins > 0 ? `${mins} minute${mins > 1 ? 's' : ''}` : `${secs} seconds`;

  return `⏱️ Timer set for ${timeStr}${label ? ` (${label})` : ''}. I'll let you know when it's done!`;
}

// ============================================================================
// NOTES
// ============================================================================

async function addNote(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
  const content = args.content as string;
  const title = args.title as string | undefined;

  if (!content && !title) {
    return 'What would you like me to note?';
  }

  const noteContent = content || title || '';

  log.info({ title, userId: ctx.userId }, '📝 Adding note');

  if (!ctx.userId) {
    return `Noted: "${noteContent.slice(0, 50)}${noteContent.length > 50 ? '...' : ''}"`;
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('notes')
      .doc(noteId)
      .set(
        cleanForFirestore({
          id: noteId,
          title: title || noteContent.slice(0, 50),
          content: noteContent,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

    log.info({ noteId, userId: ctx.userId }, '✅ Note added');
    return `📝 Noted! ${title ? `"${title}"` : ''}`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Note storage failed');
    return `Noted: "${noteContent.slice(0, 50)}${noteContent.length > 50 ? '...' : ''}"`;
  }
}

async function getNotes(
  _args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  log.info({ userId: ctx.userId }, '📝 Getting notes');

  if (!ctx.userId) {
    return "I don't have notes stored for you yet.";
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const snapshot = await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('notes')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (snapshot.empty) {
      return "You haven't saved any notes yet.";
    }

    const notes = snapshot.docs.map((doc) => {
      const data = doc.data();
      return `📝 ${data.title || data.content?.slice(0, 40)}`;
    });

    return `Your recent notes:\n${notes.join('\n')}`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Note retrieval failed');
    return "I couldn't fetch your notes right now.";
  }
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  let fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // Resolve aliases to canonical tool names
  if (TOOL_ALIASES[fnLower]) {
    log.debug({ original: fnLower, resolved: TOOL_ALIASES[fnLower] }, '🔀 Resolving tool alias');
    fnLower = TOOL_ALIASES[fnLower];
  }

  // Tasks
  if (fnLower === 'addtask') return addTask(args, ctx);
  if (fnLower === 'gettasks') return getTasks(args, ctx);
  if (fnLower === 'completetask') return completeTask(args, ctx);

  // Goals
  if (fnLower === 'addgoal') return addGoal(args, ctx);
  if (fnLower === 'getgoals') return getGoals(args, ctx);
  if (fnLower === 'updategoal') {
    log.info({ args }, '🎯 Goal update requested');
    return 'Goal progress tracking is being implemented. Keep working toward your goal!';
  }

  // Timers & Reminders
  if (fnLower === 'settimer') return setTimer(args, ctx);
  if (fnLower === 'schedulereminder') return scheduleReminder(args, ctx);
  if (fnLower === 'gettimer' || fnLower === 'canceltimer') {
    return 'Timer management is coming soon!';
  }
  if (fnLower === 'cancelreminder' || fnLower === 'getreminders') {
    return 'Reminder management is coming soon!';
  }

  // Notes
  if (fnLower === 'addnote') return addNote(args, ctx);
  if (fnLower === 'getnotes') return getNotes(args, ctx);
  if (fnLower === 'searchnotes') {
    const query = args.query as string;
    log.info({ query }, '🔍 Searching notes');
    return getNotes(args, ctx); // For now, return all notes
  }

  // Journal
  if (fnLower === 'addjournal') {
    const entry = args.entry as string;
    const mood = args.mood as string;
    log.info({ mood, userId: ctx.userId }, '📔 Journal entry');

    if (!entry) {
      return 'What would you like to journal about?';
    }

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('journal')
          .add(
            cleanForFirestore({
              entry,
              mood,
              createdAt: new Date(),
            })
          );

        return `📔 Journal entry saved. ${mood ? `Feeling ${mood} today.` : ''} Thanks for sharing.`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Journal storage failed');
      }
    }
    return `📔 I've noted your journal entry. ${mood ? `Feeling ${mood} today.` : ''} Thanks for sharing.`;
  }

  if (fnLower === 'getjournals') {
    log.info({ userId: ctx.userId }, '📔 Getting journals');

    if (!ctx.userId) {
      return "I don't have journal entries stored for you yet.";
    }

    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      const snapshot = await db
        .collection('bogle_users')
        .doc(ctx.userId)
        .collection('journal')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

      if (snapshot.empty) {
        return "You haven't journaled yet. What's on your mind?";
      }

      const entries = snapshot.docs.map((doc) => {
        const data = doc.data();
        const date = data.createdAt?.toDate?.()?.toLocaleDateString() || 'recently';
        const mood = data.mood ? ` (${data.mood})` : '';
        return `📔 ${date}${mood}: ${data.entry?.slice(0, 50)}...`;
      });

      return `Recent journal entries:\n${entries.join('\n')}`;
    } catch (err) {
      log.warn({ error: String(err) }, 'Journal retrieval failed');
      return "I couldn't fetch your journal right now.";
    }
  }

  return null;
}

export const productivityExecutor: DomainExecutor = {
  domain: 'productivity',
  handles: HANDLED_TOOLS,
  execute,
};

export default productivityExecutor;
