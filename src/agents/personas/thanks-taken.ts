/**
 * THANKS_TAKEN=on (#3877): the caller thanks Ferni, or says something kind
 * about him, in the middle of a call. Live on dev, "Thanks. Really. Thank you.
 * You're a good listener." got the next cat joke on 2 of 2 calls: the
 * anti-assistant lines keep him off "you're welcome", and nothing tells him to
 * take the thanks at all. A friend takes it in a few words of their own.
 *
 * Not a goodbye ("thanks, bye" is call-farewell.ts's), and not a "thanks"
 * that thanks nobody here (NOT_THANKING). Whole words only. A missed thank-you
 * costs nothing; warmth for "thanks for nothing" costs the joke and the trust,
 * so any doubt reads as no thanks. A heavy turn is left out by the caller
 * (turn-extras.ts), which already reads it.
 *
 * @module agents/personas/thanks-taken
 */
import { callerSaysGoodbye } from '../shared/goodbye-phrases.js';

const THANKED =
  /\b(?:thanks|thank you|thank u|thx|appreciate (?:it|you|that|this)|(?:you'?re|you are) (?:a |such a |a really )?(?:good|great|lovely) (?:listener|friend)|you'?re the best)\b/i;

/** A "thanks" that thanks nobody on this call. Gaps are bounded; the text is capped. */
const NOT_THANKING: readonly RegExp[] = [
  // A decline: "no thanks", "thanks but no".
  /\bno,? thanks?\b|\bno thank you\b|\bthanks?,? but no\b/i,
  // A cause: "thanks to the storm we lost power". "Thanks to you" still counts.
  /\bthanks to (?!you\b)/i,
  // Sarcasm: "thanks for nothing", "gee, thanks", "thanks a lot, now it's broken".
  /\bthanks for nothing\b/i,
  /\b(?:gee|geez|jeez),? thanks?\b/i,
  /\bthanks a (?:lot|bunch)\b[^.!?]{0,40}?\b(?:now|reminding|broke|broken|ruined)\b/i,
  // Passed on, not said: "my mom says thanks", "my sister said thank you". "I said thanks" counts.
  /\b(?!i\b)[a-z]+ (?:says|said|sends|sent) (?:her |his |their )?(?:thanks|thank you)\b/i,
];

/** A thank-you is read from the end of a long turn: where "anyway, thank you" is. */
const THANKS_READ_CHARS = 600;

/** A sincere thank-you or kind word to Ferni that isn't a goodbye or a "thanks" to nobody. */
export function callerThanked(text: string): boolean {
  const said = text.slice(-THANKS_READ_CHARS);
  return THANKED.test(said) && !NOT_THANKING.some((p) => p.test(said)) && !callerSaysGoodbye(text);
}

export const THANKS_TAKEN_LINE =
  'They just thanked you or said something kind about you. Take it in a few words of your own (shy, teasing or warm; not "you\'re welcome", "anytime" or "happy to help") before anything else. Don\'t step past it to your next line.';
