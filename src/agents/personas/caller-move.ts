/**
 * What the caller just did, read from their words: an acknowledgement, a
 * look-up, a request, a question about him, or something shared. The regex
 * read of the turn (turn-shape.ts re-exports it; turn-understanding.ts is the
 * model's read of the same five moves).
 *
 * @module agents/personas/caller-move
 */

import { flagOn } from '../../config/env-flag.js';

export type CallerMove = 'request' | 'about_ferni' | 'ack' | 'share' | 'lookup';

/**
 * Things only a tool knows: weather, news, scores, travel times, places
 * nearby. Read as "share", these questions got "one short sentence, your own
 * take" and Ferni answered from nothing: "pretty solid rain all weekend", "the
 * Dodgers actually pulled it off, wait, no, they lost", "about four hours" to
 * Zion from St. George (real: one), with the weather, news and search tools in
 * the request (local A/B, 2026-10-08).
 */
const LIVE_TOPIC =
  /\b(weather|forecast|rain(ing)?|snow(ing)?|temperature|news|headlines?|who won|scores?|standings|did (the )?\w+( \w+)? (win|lose)|game (today|tonight|last night)|traffic|commute|drive|driving|how far|flights?|nearby|near (me|here)|around here|open (now|late|today)|stock price|price of)\b/i;
/**
 * Asked, not told ("It rained all weekend" is the caller's news): a question
 * mark, or a question word after at most a couple of lead-in words ("Hey!
 * Quick one, what's..."), for transcripts that drop the question mark.
 */
const ASKED =
  /\?|^\W*(is|are|will|did|does|can you|could you)\b|^\W*([\w']+[.!,]?\s+){0,3}(what|what's|whats|who|when|where|how|any|anything)\b/i;

export const isLookup = (t: string): boolean => LIVE_TOPIC.test(t) && ASKED.test(t);

const ASKS_FOR_MORE =
  /\b(explain|walk me through|step by step|tell me (a|about|again|more)|plan|ideas|suggest|recommend|advice|what should i|how (do|should|can|would) (i|we)|help me|how does|why (do|does|is|did))\b/i;
/**
 * "Do you think" asks about him only when what follows is about him ("do you
 * think you'd like hiking?", "what do you think of yourself?"). Matched as
 * plain "do you think", "So, what do you think?" read as about_ferni and was
 * answered from his own day: "Oh, I'm just sitting here with a cold cup of
 * tea", "My wife swears the new coffee grinder changed nothing" to "What do
 * you think her next move is?" (dev capability sweep, 2026-10-21, B3).
 */
export const ABOUT_FERNI =
  /\b(how are you|how('s| is| was) your|what about you|and you\b|what('re| are) you (doing|up to)|what did you|do you (like|have|ever|remember)|do you think (?:(?:of|about) )?(?:you|your|yourself)\b|have you (ever|been)|your (day|week|weekend|morning|life|wife|dad))\b/i;
/**
 * Asked for his view on their topic: "what do you think?", "do you think I
 * should quit?", "what would you do?". A request for an answer, not a question
 * about him (read after ABOUT_FERNI, so "do you think you'd like it?" stays his).
 */
const OPINION_ASK = /\b(?:what do you think|do you think|what would you do)\b/i;
const ACK =
  /^(yeah|yep|yes|ok(ay)?|right|sure|true|totally|haha+|ha|mm+|hm+|no|nope|got it|i guess|maybe|thanks?( you)?|cool|nice|wow)[.!?,\s]*$/i;

/**
 * About their own things or what he can do for them, not about him: "do you
 * have my number?" read as about_ferni ("do you have"), so the turn asked
 * for his day and he answered "I do have your number, but ... I was just
 * about to head out and try to find a replacement houseplant" (prod,
 * 2026-10-17).
 */
export const ABOUT_THEIR_THINGS =
  /\b(?:do|did|can|could|would|will) you (?:still |even |actually )?(?:have|know|remember|keep|save|store|see|get|call|text|reach|ring|phone|message|email|send)\b(?:\s+\w+)?\s+(?:my|me|mine|our|us)\b/i;

/**
 * CALLER_SETUP_READ=on: "and you" asks about him only where the caller
 * hands the turn over ("good, and you?"). Mid-line it is their own story: on
 * dev "And you know what the thing is?", the setup to a punchline, read as
 * about_ferni and he told a story of his own about Hollis (#3810).
 */
const AND_YOU_MID = /\band you\b(?![?.!,\s]*$)/gi;

export function callerMove(
  text: string,
  env: Record<string, string | undefined> = process.env
): CallerMove {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 3 && ACK.test(t)) return 'ack';
  if (isLookup(t)) return 'lookup';
  if (ASKS_FOR_MORE.test(t) || ABOUT_THEIR_THINGS.test(t)) return 'request';
  const aboutHim = flagOn('CALLER_SETUP_READ', env) ? t.replace(AND_YOU_MID, 'and') : t;
  if (ABOUT_FERNI.test(aboutHim)) return 'about_ferni';
  if (OPINION_ASK.test(t)) return 'request';
  return 'share';
}

/** Asked for his take on their topic, not about him (callerMove's opinion branch). */
export function opinionAsk(text: string): boolean {
  return OPINION_ASK.test(text) && callerMove(text) === 'request';
}

/** "You know what the thing is?", "guess what": the setup to their own punchline. */
const SETUP =
  /\b(?:you know what|guess what|get this|the thing is|wait (?:till|until) you hear)\b/i;

/**
 * The caller is telling something of theirs, so no story of his own rides this
 * reply (ferni-state.ts): a share of 8+ words, or, with CALLER_SETUP_READ=on, a
 * short setup to their punchline (#3810).
 */
export function callerSharing(
  said: string,
  move: CallerMove,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (move !== 'share') return false;
  if (said.split(/\s+/).filter(Boolean).length >= 8) return true;
  return flagOn('CALLER_SETUP_READ', env) && SETUP.test(said);
}
