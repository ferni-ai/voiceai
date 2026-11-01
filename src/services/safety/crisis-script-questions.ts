/**
 * The 911 script's own questions (crisis-guard.ts speaks them; crisis-script-answer.ts reads the
 * caller's answer by them). A bare yes or no means what the question makes it mean: a yes to the
 * first is risk, a no to the second (nobody is there) is risk too.
 * @module CrisisScriptQuestions
 */

/** Yes: they took something or are in danger. No: neither. */
export const TAKEN_OR_IN_DANGER = "If you've taken something or you're in danger right now";

/** Yes: someone is with them. No: they are alone. */
export const ANYONE_NEARBY = 'Is anyone nearby who can be with you?';
