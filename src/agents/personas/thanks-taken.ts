/**
 * THANKS_TAKEN=on (#3877): the caller thanks Ferni, or says something kind
 * about him, in the middle of a call. Live on dev, "Thanks. Really. Thank you.
 * You're a good listener." got the next cat joke on 2 of 2 calls: the
 * anti-assistant lines keep him off "you're welcome", and nothing tells him to
 * take the thanks at all. A friend takes it in a few words of their own.
 *
 * Not a goodbye ("thanks, bye" is call-farewell.ts's) and not a decline
 * ("no thanks", "thanks but no"). Whole words only.
 *
 * @module agents/personas/thanks-taken
 */
import { callerSaysGoodbye } from '../shared/goodbye-phrases.js';

const THANKED =
  /\b(?:thanks|thank you|thank u|thx|appreciate (?:it|you|that|this)|(?:you'?re|you are) (?:a |such a |a really )?(?:good|great|lovely) (?:listener|friend)|you'?re the best)\b/i;

const DECLINED =
  /\bno,? thanks?\b|\bno thank you\b|\bthanks?,? but no\b|\bthanks? but no thanks\b/i;

/** A sincere thank-you or kind word to Ferni that isn't a goodbye or a decline. */
export function callerThanked(text: string): boolean {
  return THANKED.test(text) && !DECLINED.test(text) && !callerSaysGoodbye(text);
}

export const THANKS_TAKEN_LINE =
  'They just thanked you or said something kind about you. Take it in a few words of your own (shy, teasing or warm; not "you\'re welcome", "anytime" or "happy to help") before anything else. Don\'t step past it to your next line.';
