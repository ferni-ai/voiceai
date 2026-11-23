/**
 * TASK_EDITS (off by default): what the model is told about the to-do tools.
 *
 * Off, the tools keep their old text, which was wrong in three ways: addTask
 * said it was for "a reminder they want" (a task never pings anyone), the
 * registry said addTask "can also update existing tasks by providing the task
 * ID" and completeTask could "delete it entirely" (neither can), and getTasks
 * read "Show the user." On, each says what it does, and updateTask exists
 * (update-task.ts). Plan: docs/plans/2026-11-16-assistant-core.md, P1.
 *
 * Read when the tools are built, once per process: turn it on with the agent's
 * env (lk agent update-secrets), not a cohort.
 *
 * @module tools/domains/productivity/task-tool-text
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

export function taskEditsOn(env: Env = process.env): boolean {
  return flagOn('TASK_EDITS', env);
}

const HONEST: Readonly<Record<string, string>> = {
  addTask:
    "Add one item to the person's to-do list, with an optional due date and priority. " +
    'A task waits on the list until they ask for it or check it off: it never pings them. ' +
    'For "remind me at 5 to call my sister", use setReminder instead.',
  completeTask:
    "Check a task off the person's to-do list when they say they did it, " +
    'e.g. "I picked up the dry cleaning, cross it off."',
  getTasks:
    "Read the person's to-do list: due today (the default), overdue, upcoming, all open, " +
    'or completed. Say only the tasks it returns.',
  updateTask:
    "Change one task already on the person's to-do list: rename it, move its due date, " +
    'change its priority, or remove it. Use for "move the dry cleaning to Friday", ' +
    '"make that one urgent", or "delete the dry cleaning one". Adding a new task is addTask.',
};

/** The model-facing description of a to-do tool: the honest one with TASK_EDITS on. */
export function taskToolDescription(toolId: 'addTask' | 'completeTask' | 'getTasks'): string {
  return taskEditsOn() ? HONEST[toolId] : getToolDescription(toolId);
}

/** updateTask's description; it exists only with TASK_EDITS on. */
export const UPDATE_TASK_DESCRIPTION = HONEST.updateTask;

/** The registry text for a to-do tool (what findTools searches): `legacy` with the flag off. */
export function taskRegistryText(toolId: keyof typeof HONEST, legacy: string): string {
  return taskEditsOn() ? HONEST[toolId] : legacy;
}
