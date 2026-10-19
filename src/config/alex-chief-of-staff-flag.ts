/**
 * ALEX_CHIEF_OF_STAFF: Alex keeps the caller's todos, goals, calendar and agenda.
 *
 * Seth, 2026-10-18: "Agents should always hand off to specialized agents." Alex
 * is the chief of staff, so a planning request goes to him instead of Ferni
 * answering it as a generalist. With the flag on:
 * - Alex is on the caller's team from the first call, whatever their stage
 *   (services/social/chief-of-staff-unlock.ts);
 * - Ferni's turn note and his handoff tool for Alex send planning to Alex
 *   (tools/handoff/chief-of-staff-note.ts), asking first as HANDOFF_ASK_FIRST
 *   wants; a quick reminder or timer Ferni still sets himself;
 * - Alex, handed the call, has CHIEF_OF_STAFF_TOOLS, and the cap keeps them
 *   (agents/multi-agent/chief-of-staff-tools.ts, config/tool-config.ts);
 * - Alex's prompt carries identity/chief-of-staff.md
 *   (agents/personas/chief-of-staff-role.ts).
 *
 * A cohort flag: read on each check, after applyCallerFlags, never at module
 * load. Off, every one of these is exactly as before.
 *
 * @module config/alex-chief-of-staff-flag
 */
import { flagOn, type Env } from './env-flag.js';

export const CHIEF_OF_STAFF_ID = 'alex-chen';

export function alexChiefOfStaffEnabled(env: Env = process.env): boolean {
  return flagOn('ALEX_CHIEF_OF_STAFF', env);
}

/**
 * The planning tools Alex has as chief of staff, by registry id: tasks,
 * commitments, reminders, the calendar and goals. The goal tools are
 * registered as manageGoal and goalsSummary (life-planning/index.ts); without
 * this they load only when the caller says "goal" (topic-mappings.ts).
 */
export const CHIEF_OF_STAFF_TOOLS = [
  'addTask',
  'getTasks',
  'completeTask',
  'recordCommitment',
  'getCommitments',
  'completeCommitment',
  'setReminder',
  'getReminders',
  'getCalendarToday',
  'getCalendarWeek',
  'createCalendarEvent',
  'manageGoal',
  'goalsSummary',
] as const;
export type ChiefOfStaffTool = (typeof CHIEF_OF_STAFF_TOOLS)[number];

/** A chief-of-staff tool the cap must keep, while the flag is on. */
export function isChiefOfStaffTool(name: string, env: Env = process.env): boolean {
  return (CHIEF_OF_STAFF_TOOLS as readonly string[]).includes(name) && alexChiefOfStaffEnabled(env);
}
