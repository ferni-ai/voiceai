/**
 * HOUR_ONCE (off by default): the time of day comes up at most once a call.
 *
 * Prod sweep 2026-10-21: the hour came up in 25 of 108 non-greeting turns, 3 of 4 in the
 * long-day call ("even at this hour", "especially in the middle of the night", "even if it
 * is four in the morning"), after the greeting had already said it ("burning the midnight
 * oil again?"). With WORLD_NOW=on every reply's turn reminder starts with "Right now for the
 * caller: Wednesday, Oct 21, 4:58 AM EDT, night. For you: 2:58 AM mountain." (world-now.ts),
 * so the hour is the freshest thing in the prompt on every turn, and the model keeps saying it.
 *
 * With the flag on, once Ferni or the caller has mentioned the hour or the part of the day on
 * this call, the line keeps the day (and any holiday or weather) but drops the clock, the part
 * of the day and Ferni's own clock, and says the time has come up already. The session
 * prompt's date/time section still has the time, and a caller who asks the time this turn
 * gets the full line, so the fact is there whenever they want it.
 *
 * @module agents/shared/hour-once
 */

import { flagOn, type Env } from '../../config/env-flag.js';

export function hourOnceEnabled(env: Env = process.env): boolean {
  return flagOn('HOUR_ONCE', env);
}

/** Said in place of the clock once the time of day has come up. */
export const HOUR_SAID =
  "The time of day already came up on this call: don't bring up the hour, the time of day, or how late or early it is again unless they ask.";

const NUMBER = String.raw`(?:\d{1,2}(?::\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;

/**
 * The hour or the part of the day, as said on a call: a clock time ("four in the morning",
 * "2:58 am", "nearly three here in Wyoming"), the night ("midnight", "at this hour", "still
 * up?", "late-night"), or a greeting by the time ("good morning", "Hey Sam, morning.").
 * "Every morning" and "this morning" are about a day, not the hour now, and don't count.
 */
const HOUR_TALK = new RegExp(
  [
    String.raw`\b${NUMBER}\s*(?:a\.?m\b\.?|p\.?m\b\.?|o'?clock\b)`,
    String.raw`\b${NUMBER}\s+(?:in the (?:morning|afternoon|evening)|at night|here in)\b`,
    String.raw`\b(?:midnight|middle of the night|wee hours|small hours|night owl|tonight)\b`,
    String.raw`\blate[- ]night\b|\blate at night\b|\b(?:late|early) hour\b`,
    String.raw`\b(?:this|that) hour\b|\b(?:this|so) (?:late|early)\b`,
    String.raw`\bstill (?:up|awake)\b|\bup (?:late|early|so late|so early)\b`,
    String.raw`\bgood (?:morning|afternoon|evening|night)\b`,
    String.raw`^(?:(?:hey|hi|hello)(?:\s+\w+)?,?\s+)?(?:morning|afternoon|evening)\b`,
  ].join('|'),
  'i'
);

/** Asking for the time or the day: the clock goes back in for this turn. */
const ASKS_TIME =
  /\bwhat time\b|\btime is it\b|\bwhat'?s the time\b|\bhow late is it\b|\bis it (?:late|early)\b|\bwhat day is (?:it|today)\b|\bwhat'?s the date\b/i;

export function mentionsTheHour(text: string): boolean {
  return HOUR_TALK.test(text.trim());
}

export function asksTheTime(words: string): boolean {
  return ASKS_TIME.test(words);
}

interface ChatItemView {
  type?: string;
  role?: string;
  textContent?: string;
  content?: unknown;
}

const textOf = (item: ChatItemView): string =>
  item.textContent ??
  (Array.isArray(item.content) ? item.content.filter((c) => typeof c === 'string').join(' ') : '');

/** True when Ferni or the caller has already mentioned the hour on this call. */
export function hourAlreadySaid(items: readonly unknown[]): boolean {
  return (items as ChatItemView[]).some(
    (item) =>
      item?.type === 'message' &&
      (item.role === 'user' || item.role === 'assistant') &&
      mentionsTheHour(textOf(item))
  );
}

/** The talk so far, as the turn reminder sees it: the chat items and the caller's words now. */
export interface CallTalk {
  items: readonly unknown[];
  words: string;
}

/** True when this turn's "Right now" line should leave the hour out. */
export function leaveTheHourOut(talk: CallTalk | undefined, env: Env = process.env): boolean {
  if (!talk || !hourOnceEnabled(env)) return false;
  return !asksTheTime(talk.words) && hourAlreadySaid(talk.items);
}
