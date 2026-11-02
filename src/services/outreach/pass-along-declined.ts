/**
 * The person Ferni called said no to having what they share passed along.
 *
 * Only personal calls ask ("Just so you know, I'll pass along what you tell me
 * to Riley. Is that okay?"); business, restaurant and healthcare calls tell and
 * never ask (owner, 2026-11-02), so only a call whose script asked can decline.
 *
 * A no counts only when it is unambiguous, and the ask was the last question
 * in Ferni's turn: their whole answer, or their first reply when it is a
 * finished sentence ("No." then "Sorry, bad line."), is a lone no ("No.",
 * "Nope.", "Um, no.") or an explicit refusal of all of it ("Please don't.", "I'm not comfortable
 * with that.", "Keep it to yourself."). Any other answer, a no followed by more
 * words included ("No, that's cool", "Keep this between us, but I'm bringing a
 * plus-one"), is delivered as before. A secret shared later in the call never
 * withholds the whole call (owner, 2026-11-02): withholding just that part is
 * not built yet, so those calls deliver as main does. Once given, a no holds
 * for the rest of the call: a later "sure, go ahead" is most often a yes to
 * Ferni's next question, not taking the no back. When in doubt, deliver.
 *
 * @module services/outreach/pass-along-declined
 */

import type { CallTranscriptTurn } from './call-transcript-intelligence.js';
import { PASS_ALONG_ASK_HEADING } from '../../tools/domains/telephony/scripts/index.js';

/** Ferni's question: "pass ... along/on ... okay?". Never "mind": a no to that is a yes. */
const ASKED = /\bpass\b[^.?!]*\b(?:along|on)\b[^?]*\b(?:okay|ok|alright|all right|fine)\b[^?]*\?$/i;
/** A no and nothing else: "No.", "Um, no.", "No thanks.", "Not really.", "Don't tell him." */
const LONE_NO =
  /^\W*(?:(?:oh|um+|uh+|well|hmm+|ah|er)\W+)*(?:(?:no+|nope|nah)(?:\W+(?:no+|nope|nah))*(?:\W+thanks|\W+thank you)?|(?:absolutely|definitely|certainly) not|not really|no way|i don't think so|(?:please )?don't tell (?:him|her|them))\W*$/i;

const OF_IT = '(?: (?:him|her|them|that|this|it|anything))?(?: on| along)?';
const PASS = `(?:tell|pass|share|say|mention)${OF_IT}`;
const KEPT = '(?:private|between us|between you and me|to yourself|to myself)';
/** A refusal of all of it, and nothing else said: never one part ("the job thing", "that part"). */
const REFUSAL = [
  "please don't",
  `don't (?:pass|share|tell|say|mention) (?:that|this|it|anything)(?: on| along)?`,
  `(?:i'd |i would )?(?:rather|prefer) (?:you )?(?:not|didn't)(?: ${PASS})?`,
  `(?:i'd |i would )?(?:rather|prefer) (?:to |you )?keep (?:this|that|it) ${KEPT}`,
  `keep (?:this|that|it) ${KEPT}`,
  "i'm not (?:comfortable|okay|ok|alright|all right)(?: with (?:that|this|it))?",
  "that's not (?:okay|ok|alright|all right|fine)(?: with me)?",
  `i don't want you to(?: ${PASS})?`,
  "(?:that's |it's )?off the record",
].join('|');
const REFUSED = new RegExp(
  `^\\W*(?:(?:oh|um+|uh+|well|hmm+|ah|er|actually|sorry|please|no+|nope|nah|thanks)\\W+)*` +
    `(?:${REFUSAL})(?:\\W+(?:please|thanks|thank you|sorry|okay|ok))*\\W*$`,
  'i'
);

/** A reply cut off mid-sentence: the next reply carries on from it. */
const UNFINISHED = /(?:[,;:\u2013\u2014-]|\.\.\.|\u2026)\s*$/;

const straight = (text: string): string =>
  text.replace(/[‘’]/g, "'").replace(/\bdo not\b/gi, "don't");

/** The last question in a turn, from the end of the one before it. */
function lastQuestion(text: string): string {
  const end = text.lastIndexOf('?');
  return end < 0 ? '' : text.slice(text.lastIndexOf('?', end - 1) + 1, end + 1).trim();
}

const asks = (turn: CallTranscriptTurn): boolean => {
  const question = lastQuestion(turn.content);
  return turn.role === 'agent' && ASKED.test(question) && !/\bmind\b/i.test(question);
};

/**
 * True when the call's script asked to pass things along and they declined,
 * unambiguously. `script` is the dispatched call script (OnBehalfDispatch.script).
 */
export function passAlongDeclined(
  script: string | undefined,
  turns: readonly CallTranscriptTurn[]
): boolean {
  if (!script?.includes(PASS_ALONG_ASK_HEADING)) return false;
  const asked = turns.findIndex(asks);
  if (asked < 0) return false;
  const after = turns.slice(asked + 1);
  const next = after.findIndex((t) => t.role === 'agent');
  // Their answer is everything they said before Ferni spoke again, read whole...
  const replies = (next < 0 ? after : after.slice(0, next))
    .filter((t) => t.role === 'recipient')
    .map((t) => straight(t.content.trim()));
  // ...or their first reply on its own, when it is a finished sentence: "No." then "Hello?" is
  // still a no, while "No," then "that's cool." is one answer.
  const first = replies[0] ?? '';
  const read = UNFINISHED.test(first) ? [replies.join(' ')] : [replies.join(' '), first];
  return read.some((answer) => LONE_NO.test(answer) || REFUSED.test(answer));
}

/** What the requester hears when they said no: that they did, and nothing they said. */
export function passAlongDeclinedLine(name: string, optedOut: boolean): string {
  const asked = `I reached ${name}. They asked me not to pass anything along from the call`;
  return optedOut
    ? `${asked}, and not to call them again, so I won't. That's all I can share.`
    : `${asked}, so that's all I can share.`;
}
