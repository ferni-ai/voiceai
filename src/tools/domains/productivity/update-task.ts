/**
 * updateTask (TASK_EDITS, off by default): one tool to rename a task, move its
 * due date, change its priority, or remove it. tasks.ts declares the tool; this
 * module decides what happens.
 *
 * Before it, "move the dry cleaning to Friday" and "delete the dry cleaning one"
 * had no tool: updateTaskPriority, rescheduleTask and deleteTask were written in
 * tasks.ts but never registered, and the registry told the model addTask could
 * update a task, which it can't. Plan: docs/plans/2026-11-16-assistant-core.md, P1.
 *
 * @module tools/domains/productivity/update-task
 */
import { z } from 'zod';
import { removeCalendarSyncedItem } from '../../../services/calendar/calendar-bridge.js';
import { runContextTimeZone } from '../../../utils/caller-time-zone.js';
import { formatStoredLocalTime } from '../../../utils/time-zone.js';
import { getLogger } from '../../utils/tool-helpers.js';
import { parseNaturalDueDate, putDueTaskOnCalendar } from './task-due-date.js';
import { pickTaskToEdit, type TaskMatch } from './task-match.js';
import type { Task, TaskPriority } from './tasks.js';

/** The task list operations updateTask needs (tasks.ts passes its own). */
export interface TaskEditStore {
  load: (userId: string) => Promise<void>;
  list: (userId: string) => Task[];
  update: (
    taskId: string,
    changes: { title?: string; dueDate?: Date; priority?: TaskPriority }
  ) => Task | null;
  remove: (taskId: string) => boolean;
}

export const UPDATE_TASK_PARAMETERS = z.object({
  taskTitle: z.string().describe('The task as they named it, e.g. "dry cleaning"'),
  newTitle: z.string().optional().describe('Its new name, only if they renamed it'),
  dueDate: z
    .string()
    .optional()
    .describe('Its new due date as they said it: "Friday", "tomorrow", "in 3 days"'),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .optional()
    .describe('Its new priority, only if they changed it'),
  remove: z.boolean().optional().describe('True only when they asked to delete or remove the task'),
});

type UpdateTaskArgs = z.infer<typeof UPDATE_TASK_PARAMETERS>;
type TaskEdit = Pick<UpdateTaskArgs, 'newTitle' | 'dueDate' | 'priority'>;

function isOpen(task: Task): boolean {
  return task.status === 'pending' || task.status === 'in_progress';
}

/** What to say when `said` named no single open task: nothing changes. */
function unclearLine(
  match: Exclude<TaskMatch<Task>, { kind: 'one' }>,
  said: string,
  open: readonly Task[]
): string {
  if (match.kind === 'several') {
    const names = match.tasks.slice(0, 5).map((t) => `"${t.title}"`);
    return `"${said}" matches ${match.tasks.length} tasks (${names.join(', ')}). Ask which one they mean; nothing changed yet.`;
  }
  const names = open.slice(0, 5).map((t) => `"${t.title}"`);
  return names.length > 0
    ? `No open task matches "${said}", so nothing changed. Their open tasks: ${names.join(', ')}.`
    : `Their to-do list is empty, so there is no "${said}" to change.`;
}

async function removeOne(store: TaskEditStore, userId: string, task: Task): Promise<string> {
  store.remove(task.id);
  if (task.dueDate) await removeCalendarSyncedItem(userId, task.id);
  getLogger().info({ taskId: task.id }, 'Task removed');
  return `Removed "${task.title}" from their to-do list.`;
}

/** What changed, for the model to say: `renamed "a" to "b", due by Friday, Nov 6, ...`. */
function changedLine(before: string, after: Task, moved: boolean, zone?: string): string {
  const parts: string[] = [];
  if (after.title !== before) parts.push(`renamed "${before}" to "${after.title}"`);
  if (moved && after.dueDate) parts.push(`due by ${formatStoredLocalTime(after.dueDate, zone)}`);
  return parts.length > 0 ? parts.join(', ') : `"${after.title}"`;
}

async function editOne(
  store: TaskEditStore,
  userId: string,
  task: Task,
  edit: TaskEdit,
  zone?: string
): Promise<string> {
  const newDue = edit.dueDate ? parseNaturalDueDate(edit.dueDate, zone) : undefined;
  if (edit.dueDate && !newDue) {
    return `"${edit.dueDate}" isn't a date the list understands, so "${task.title}" is unchanged. Ask for a day like "Friday" or "in 3 days".`;
  }
  if (!edit.newTitle && !newDue && !edit.priority) {
    return `Nothing to change on "${task.title}": ask whether they want to rename it, move it, change its priority, or remove it.`;
  }

  const before = task.title;
  const updated = store.update(task.id, {
    ...(edit.newTitle ? { title: edit.newTitle } : {}),
    ...(newDue ? { dueDate: newDue } : {}),
    ...(edit.priority ? { priority: edit.priority } : {}),
  });
  if (!updated) return `"${before}" couldn't be changed just now; nothing was saved.`;

  if (updated.dueDate && (newDue || updated.title !== before)) {
    // The calendar entry follows the task: replaced, so a rename or a move shows there too.
    await removeCalendarSyncedItem(userId, updated.id);
    await putDueTaskOnCalendar({ ...updated, dueDate: updated.dueDate, timeZone: zone });
  }

  let line = `Updated: ${changedLine(before, updated, Boolean(newDue), zone)}`;
  if (edit.priority) line += `, now ${edit.priority} priority`;
  getLogger().info({ taskId: updated.id, moved: Boolean(newDue) }, 'Task updated');
  return `${line}.`;
}

/** updateTask's execute: find the one task they named, then change or remove it. */
export async function runTaskUpdate(
  store: TaskEditStore,
  { taskTitle, remove, ...edit }: UpdateTaskArgs,
  ctx: unknown
): Promise<string> {
  const userId = (ctx as { userData?: { userId?: string } })?.userData?.userId || 'default';
  await store.load(userId);
  const open = store.list(userId).filter(isOpen);
  const match = pickTaskToEdit(open, taskTitle);
  if (match.kind !== 'one') return unclearLine(match, taskTitle, open);
  if (remove) return removeOne(store, userId, match.task);
  return editOne(store, userId, match.task, edit, runContextTimeZone(ctx));
}
