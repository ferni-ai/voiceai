/**
 * A first call is a first meeting: the hello must never greet a stranger as an
 * old friend.
 *
 * Prod sweep (2026-10-21, 16 simulated first calls on ferni-prod): 7 openers
 * implied a shared past, "Hey Sam, burning the midnight oil again?" five times,
 * "Did that coffee finally kick in?" and "did you survive the early start?".
 * The session knew it was a stranger (isReturningUser false), but the hello
 * was told to answer "like you would a friend calling" (with FERNI_PLAYFUL, "a
 * light, friendly tease"), its facts never said the two had not spoken, and
 * its scripted understudy was built as a friend's.
 *
 * @module agents/multi-agent/first-call-stranger
 */

import { returningOnceLoaded } from '../../services/session/deferred-profile.js';
import type { UserProfile } from '../../types/user-profile.js';
import { isFirstCall } from '../personas/first-call-rapport.js';
import type { CallerHistory } from './greeting-direction.js';

/**
 * The hello's direction on a first call, with or without FERNI_PLAYFUL: no
 * tease, since a tease needs a shared past. Keeps "or introduce yourself" so a
 * first-call intro (FIRST_CALL_INTRO) can lift that ban the same way it does
 * on the other hello directions.
 */
export const STRANGER_GREETING_DIRECTION =
  'They just called you, and this is the first time you have ever talked. Answer the way you would someone you are glad to meet: warm, plain and curious, one short sentence, maybe a quick easy question about how they are or what is on their mind. No exclamation marks, no "so good to hear your voice", no hype, no tease, do not list what you can do or introduce yourself. You know nothing about them beyond the facts you are given: never imply you have talked before or know their habits, so no "again", "finally", "still", "back", "as usual" or "last time", and no guesses about their day.';

/** The fact that says so, beside the time of day and their name. */
export const FIRST_CALL_FACTS: Readonly<Record<string, string>> = {
  'how well you know each other': 'first time talking',
};

/**
 * Words that only make sense with a shared past. Whole words only: "again" is
 * not "against", "back" is not "backpack". "Still up?" asks about tonight, not
 * about last time, so "still" before up/awake/there/here is allowed.
 */
const SHARED_PAST =
  /\b(?:again|finally|surviv(?:e|ed|ing)|back|as usual|as always|like always|last time|missed you|still\b(?!\s+(?:up|awake|there|here)\b))\b/i;

/** True when a line implies the speaker and listener have talked before. */
export function impliesSharedPast(line: string): boolean {
  return SHARED_PAST.test(line);
}

/** How long the hello waits for a deferred profile, like its other lookups. */
const PROFILE_WAIT_MS = 400;

/**
 * True when this is a known account's first call (first-call-rapport.ts) and
 * the profile agrees. The multi-agent fast path loads the profile after setup,
 * so a returning caller can look new for a moment: this waits for that load,
 * and if it is too slow keeps the usual hello rather than guess "stranger".
 */
export async function isStrangerCall(
  userData: unknown,
  history: CallerHistory | undefined,
  waitMs: number = PROFILE_WAIT_MS
): Promise<boolean> {
  if (history || !isFirstCall(userData)) return false;
  const u = userData as {
    isReturningUser?: unknown;
    services?: { userProfile: UserProfile | null };
  };
  if (!u.services) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), waitMs);
  });
  const returning = await Promise.race([returningOnceLoaded(u.services, false), late]);
  clearTimeout(timer);
  return returning === false && u.isReturningUser !== true;
}
