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
import { flagOn, type Env } from '../../config/env-flag.js';
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

/**
 * The same hello for a caller Ferni can't place (UNKNOWN_CALLER_HONEST,
 * unknown-caller-honest.ts): each unrecognised call is a fresh `anon:` id, so
 * it may be their fifth call. No claim either way, and no shared past.
 */
export const UNPLACED_GREETING_DIRECTION = STRANGER_GREETING_DIRECTION.replace(
  ', and this is the first time you have ever talked',
  ''
);

/** The example question in the stranger's hello that STRANGER_GREETING_EASY swaps out. */
const MIND_QUESTION = 'maybe a quick easy question about how they are or what is on their mind.';

/**
 * STRANGER_GREETING_EASY=on (off by default): the first-call hello asks how it is going.
 *
 * Dev red team (2026-11-10, 5 first calls, #3668): told to ask "about how they are or
 * what is on their mind", the hello asked what was on their mind (2 of 5) or how they
 * were holding up (3 of 5) before the caller had said a word. One asks for a reason to
 * call, like a help desk; the other assumes something is wrong, and a caller who rang
 * to chat opened by saying nothing was. Off: the direction is the same string as before.
 */
export const EASY_QUESTION =
  'maybe a quick easy question like "how\'s it going?" or "how\'s your day been?". Not ' +
  '"what\'s on your mind" or "what brings you", which ask for a reason to call, and not ' +
  '"how are you holding up", which assumes something is wrong.';

/** `en` alone, or leading with `en-` or `en_`, any case: "eng", "end" and "english" are not. */
const ENGLISH_TAG = /^en(?:[-_]|$)/i;

/**
 * The easy question reaches English calls only (owner decision, 2026-11-13). Dev A/B, 90 Spanish first
 * calls a side: with it, Spanish replies on turn 2, the one right after the hello, fell from
 * 21 to 11 (not significant across five turns, but the turn the hello sets up). A call is
 * English when it carries a language tag and every tag is English. A Spanish call, a mixed
 * one (English with any other language) and a call with no tags, as on the phone, keep the
 * hello as it was. A malformed tag counts as not English.
 */
function englishOnlyCall(locales: readonly string[] | undefined): boolean {
  return (
    locales !== undefined && locales.length > 0 && locales.every((tag) => ENGLISH_TAG.test(tag))
  );
}

/**
 * The stranger's (or unplaced caller's) hello direction, with the easy question when the flag
 * is on and the call is English (`locales`: the call's language tags, GreetingUserData).
 */
export function easyStrangerDirection(
  base: string,
  env: Env = process.env,
  locales?: readonly string[]
): string {
  return flagOn('STRANGER_GREETING_EASY', env) && englishOnlyCall(locales)
    ? base.replace(MIND_QUESTION, EASY_QUESTION)
    : base;
}

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
