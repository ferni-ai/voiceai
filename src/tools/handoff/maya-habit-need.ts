/**
 * Habit talk that calls for Maya, while MAYA_HABIT_TRIGGERS is on (#1431).
 *
 * Maya is the habits coach for every part of life (her bundle's team.role_description),
 * but the words that brought her up on a call (team-by-need-note.ts) were "habit",
 * "routine", workouts and budgets. A caller who says "I broke my streak" or "I keep
 * forgetting to stretch" is talking about a habit without the word. These phrases add
 * that, and only as a fallback: when the caller's words also fit another teammate
 * ("I meditate every morning" is Nayan's, "I want to schedule a walk every morning" is
 * Alex's), that teammate keeps them.
 *
 * Whole words and phrases only: "I forgot my keys" is not a habit, and neither is a
 * single "every day" ("I think about him every day"), so neither is here.
 *
 * @module tools/handoff/maya-habit-need
 */

import { flagOn, type Env } from '../../config/env-flag.js';

export const MAYA_ID = 'maya-santos';

/** Habit talk without the word "habit". Matched against lower-cased caller words. */
export const MAYA_HABIT_WORDS =
  /\b(streaks?|every (single )?(morning|evening)|each (morning|evening)|keep forgetting to|keep skipping|fell off the wagon)\b/;

/**
 * True when MAYA_HABIT_TRIGGERS is on and the caller's words are habit talk.
 *
 * @param callerWords - what the caller said, lower-cased
 */
export function isMayaHabitTalk(callerWords: string, env: Env = process.env): boolean {
  return flagOn('MAYA_HABIT_TRIGGERS', env) && MAYA_HABIT_WORDS.test(callerWords);
}
