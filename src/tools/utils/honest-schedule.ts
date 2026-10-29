/**
 * What a scheduling tool tells the model it stored, so Ferni never confirms
 * more than was saved. On a dev call (2026-10-11) he said "I've got that set
 * up to remind you daily" after one non-repeating task at 5 AM ET: none of
 * the reminder, task or medication paths stores a repeat rule that fires.
 *
 * @module tools/utils/honest-schedule
 */

const REPEAT_WORDS =
  /\b(every|daily|nightly|weekly|monthly|weekdays|weekends|recurring|repeating|each (day|morning|afternoon|evening|night|week|month))\b/i;

/** The user asked for something that repeats ("every morning", "daily"). */
export function asksToRepeat(...texts: Array<string | undefined>): boolean {
  return REPEAT_WORDS.test(texts.filter(Boolean).join(' '));
}

/** Appended when a repeat was asked for and only one occurrence was stored. */
export const NO_REPEAT_YET =
  " It does not repeat: repeating reminders aren't supported yet. Tell them plainly you can remind them this once but can't do it every time yet.";

/**
 * Said in place of "I'll remind you" by a tool that stores no reminder job
 * (#1439): nothing fires later, so the reply must not promise that it will.
 */
export const NO_TIMED_REMINDER = "Noted, but I can't set a timed reminder for that here.";
