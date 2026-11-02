/**
 * The person Ferni called said no to having what they share passed along.
 *
 * Every call script asks ("Just so you know, I'll pass along what you tell me
 * to Riley. Is that okay?", scripts/*: passAlongScript) and tells the model
 * that a no is fine: it still gives them the member's message and doesn't
 * press. A no counts when their first reply to that question is one (a
 * refusal, or a leading no with no yes after it: "No, that's fine" is a yes),
 * or when they take it back at any point ("off the record", "don't tell him").
 * The member then hears only that they asked for nothing to be passed along:
 * no summary, no message and no action items are kept, and their words never
 * go to the summary model. A crisis read on their words still reaches the
 * member, as Ferni's own line (#2861).
 *
 * @module services/outreach/pass-along-declined
 */

import type { CallOutcome } from '../../tools/domains/telephony/types.js';
import type { CallTranscriptTurn } from './call-transcript-intelligence.js';
import { crisisCallerLine, crisisRead } from './caller-text.js';

/** Ferni's pass-along question, however the model words it: "pass ... along ... okay?". */
const ASKED = /\bpass\b[^.?!]*\b(?:along|on)\b[^?]*\b(?:okay|ok|alright|all right|fine)\b[^?]*\?/i;
/**
 * A no anywhere in their answer, which no yes cue undoes: "please don't",
 * "I'd rather not", "I don't want you to", "that's not okay".
 */
const REFUSED =
  /\b(?:please don't|don't (?:tell|share|pass|repeat)\b|(?:rather|prefer) (?:you )?(?:not|didn't)\b|don't want (?:you|him|her|them)\b|keep (?:this|that|it) (?:between us|to yourself|private)|not (?:okay|ok|alright|all right)\b|don't think so\b|no way\b)/i;
/** Their answer starts with a no ("no", "nope", "nah", "not really"), after an "oh" or an "um". */
const STARTS_NO = /^\W*(?:(?:oh|um+|uh+|well|hmm+|actually)\W+)*(?:no|nope|nah|not really)\b/i;
/** A yes after that no: "No, that's fine", "Nope, all good", "No worries". */
const THEN_YES =
  /\b(?:fine|okay|ok|alright|all right|go ahead|go for it|all good|don't mind|sure|no (?:problem|worries|prob))\b/i;
/** Anywhere in the call, they take it back: "don't pass that on", "keep this between us". */
const WITHDRAWN =
  /\bdon't (?:pass (?:that|this|it|any of (?:that|this)) (?:on|along)|tell (?:him|her|them)\b|share (?:that|this|it)\b|repeat (?:that|this|it)\b)|\b(?:keep (?:this|that|it)|just) between (?:us|you and me)\b|\bkeep (?:this|that|it) to yourself\b|\boff the record\b|\bi'd (?:rather|prefer) you (?:didn't|not)\b|\bdon't want (?:him|her|them) to know\b/i;

const straight = (text: string): string =>
  text.replace(/[\u2018\u2019]/g, "'").replace(/\bdo not\b/gi, "don't");

/** Their answer to the question is a no: a refusal, or a leading no with no yes after it. */
const saidNo = (answer: string): boolean =>
  REFUSED.test(answer) || (STARTS_NO.test(answer) && !THEN_YES.test(answer));

/** True when their first reply to Ferni's pass-along question is a no, or they take it back later. */
export function passAlongDeclined(turns: readonly CallTranscriptTurn[]): boolean {
  const heard = turns.filter((t) => t.role === 'recipient').map((t) => straight(t.content));
  if (heard.some((h) => WITHDRAWN.test(h))) return true;
  const asked = turns.findIndex((t) => t.role === 'agent' && ASKED.test(t.content));
  if (asked < 0) return false;
  const answer = turns.slice(asked + 1).find((t) => t.role === 'recipient');
  return answer !== undefined && saidNo(straight(answer.content));
}

/** What the member hears when they said no: that they did, and nothing they said. */
export function passAlongDeclinedOutcome(
  callId: string,
  name: string,
  heard: readonly string[],
  optedOut = false
): CallOutcome {
  const crisis = heard.some(crisisRead) || crisisRead(heard.join(' '));
  const asked = `I reached ${name}. They asked me not to pass anything along from the call`;
  const said = optedOut
    ? `${asked}, and not to call them again, so I won't. That's all I can share.`
    : `${asked}, so that's all I can share.`;
  return {
    callId,
    status: 'completed',
    objectiveAchieved: false,
    outcome: crisis ? `${said} ${crisisCallerLine(name)}` : said,
  };
}
