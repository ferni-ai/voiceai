/**
 * The person Ferni called said no to having what they share passed along.
 *
 * Only personal calls ask ("Just so you know, I'll pass along what you tell me
 * to Riley. Is that okay?"); business, restaurant and healthcare calls tell and
 * never ask (owner, 2026-11-02), so only a call whose script asked can decline.
 *
 * A no counts only when it is unambiguous, and the ask was the last question
 * in Ferni's turn: their answer is a lone no ("No.", "Nope.", "Um, no."), or
 * it, or anything later in the call, carries an explicit refusal ("don't pass
 * that on", "I'm not comfortable with that", "keep this between us"). Any
 * other answer, a no followed by more words included ("No, that's cool"), is
 * delivered as before. When in doubt, deliver.
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
/** An explicit refusal, as their first reply to the question. */
const REFUSED =
  /\b(?:please don't\W*$|don't (?:pass|share) (?:that|this|it|anything)(?: on| along)?\W*$|(?:rather|prefer) (?:you )?(?:not|didn't)(?:\W*$| (?:tell|pass|share|say|mention)\b)|i'm not comfortable\W*$|i'm not (?:comfortable|okay|ok|alright|all right) with (?:that|this|it)\b|that's not (?:okay|ok|alright|all right|fine)\b|i don't want you to(?:\W*$| (?:tell|pass|share|say)\b)|keep (?:this|that|it) (?:between us|to yourself|private)\b|off the record\b)/i;
/** Taking it back later in the call: only the unmistakable ways of saying so. */
const WITHDRAWN =
  /\b(?:don't pass (?:that|this|it|any of (?:that|this)) (?:on|along)\b|keep (?:this|that|it) between (?:us|you and me)\b|off the record\b|i'd rather you didn't (?:mention|tell|pass|share|say)\b)/i;

const straight = (text: string): string =>
  text.replace(/[\u2018\u2019]/g, "'").replace(/\bdo not\b/gi, "don't");

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
  // Their answer is everything they said before Ferni spoke again: a lone no only if all of it is.
  const replies = (next < 0 ? after : after.slice(0, next))
    .filter((t) => t.role === 'recipient')
    .map((t) => straight(t.content.trim()));
  if (LONE_NO.test(replies.join(' ')) || REFUSED.test(replies[0] ?? '')) return true;
  return after.some((t) => t.role === 'recipient' && WITHDRAWN.test(straight(t.content)));
}

/** What the requester hears when they said no: that they did, and nothing they said. */
export function passAlongDeclinedLine(name: string, optedOut: boolean): string {
  const asked = `I reached ${name}. They asked me not to pass anything along from the call`;
  return optedOut
    ? `${asked}, and not to call them again, so I won't. That's all I can share.`
    : `${asked}, so that's all I can share.`;
}
