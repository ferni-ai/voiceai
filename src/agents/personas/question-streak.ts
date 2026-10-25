/**
 * QUESTION_STREAK_GUARD=on: when Ferni's last replies in a row all ended on a
 * question, the told-this-call note asks the next one to end without one.
 *
 * Over the 2026-10-17 → 10-24 prod calls (52 with 4+ replies), the median call
 * ended 29% of replies on a question, which is fine; but 9 of the 20 long calls
 * (15+ replies) had three question-endings in a row, which is what reads as an
 * interview (conduct, the judge's lowest dimension). So this counts a streak, not
 * a rate. Cut replies count (CUT_REPLY_IN_HISTORY keeps them in the chat), and
 * backchannels ("Mhm") don't break or extend a streak.
 *
 * Never on a safety question: a streak holding one gets no note, and keptTold
 * drops the note on a call with crisis risk noted (told-this-call.ts).
 *
 * @module agents/personas/question-streak
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { Line } from './director-notes.js';
import { isSafetyLine } from './phrase-loops.js';

export function questionStreakGuardOn(env: Env = process.env): boolean {
  return flagOn('QUESTION_STREAK_GUARD', env);
}

/** Replies in a row ending on a question before the note is added. */
export const STREAK = 2;
/** Shorter replies are backchannels, not turns. */
const MIN_WORDS = 4;

/** A reply as heard: [laughter] and cut marks removed. */
const spoken = (text: string): string =>
  text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * How many of Ferni's latest replies in a row ended on a question, or 0 when one
 * of them asked a safety question.
 */
export function questionStreak(lines: Line[]): number {
  let streak = 0;
  for (const line of [...lines].reverse()) {
    if (line.speaker !== 'ferni') continue;
    const text = spoken(line.text);
    if (text.split(' ').length < MIN_WORDS) continue;
    if (!/\?["'”’)]*$/.test(text)) break;
    const question = text.split(/(?<=[.!?])\s+/).at(-1) ?? text;
    if (isSafetyLine(question)) return 0;
    streak++;
  }
  return streak;
}

/** The note for a streak, or '' below STREAK. */
export function formatQuestionStreak(streak: number): string {
  return streak >= STREAK
    ? `Your last ${streak} replies ended on a question. End this one without asking one.`
    : '';
}
