/**
 * QUESTION_STREAK_GUARD=on: when Ferni's last replies in a row all ended on a
 * question, the told-this-call note asks the next one to end without one.
 *
 * Over the 2026-10-17 → 10-24 prod calls (52 with 4+ replies), the median call
 * ended 29% of replies on a question, which is fine; but 9 of the 20 long calls
 * (15+ replies) had three question-endings in a row, which is what reads as an
 * interview (conduct, the judge's lowest dimension). So this counts a streak, not
 * a rate. A reply cut before it was heard still counts (CUT_REPLY_IN_HISTORY keeps
 * it in the chat; asking anyway is the habit); the unheard rest of a part-heard
 * reply doesn't, and backchannels ("Mhm") neither break nor extend a streak.
 *
 * Never against a safety question. Word lists can't tell one (the #2808 verify:
 * 18 of 22 paraphrases missed), so the note itself leaves the model room to check
 * someone is safe; a streak with any sentence on safety gets no note at all; and
 * keptTold drops it while a crisis read is in flight or once risk is noted
 * (told-this-call.ts).
 *
 * @module agents/personas/question-streak
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { Line } from './director-notes.js';
import { isSafetyLine } from './phrase-loops.js';
import { CUT_REST_MARK } from '../shared/cut-reply-history.js';

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

/** Ends on a question, past closing quotes, brackets and emoji ("going? 😊"). */
const ENDS_ON_QUESTION = /\?[\s"'”’)\p{Extended_Pictographic}️]*$/u;

/**
 * How many of Ferni's latest replies in a row ended on a question, or 0 when any
 * sentence of them is on safety.
 */
export function questionStreak(lines: Line[]): number {
  let streak = 0;
  for (const line of [...lines].reverse()) {
    if (line.speaker !== 'ferni' || line.text.startsWith(CUT_REST_MARK)) continue;
    const text = spoken(line.text);
    if (text.split(' ').length < MIN_WORDS) continue;
    if (!ENDS_ON_QUESTION.test(text)) break;
    if (text.split(/(?<=[.!?])\s+/).some(isSafetyLine)) return 0;
    streak++;
  }
  return streak;
}

/** The note for a streak, or '' below STREAK. */
export function formatQuestionStreak(streak: number): string {
  return streak >= STREAK
    ? `Your last ${streak} replies ended on a question. End this one without asking one, unless you need to check they're safe.`
    : '';
}
